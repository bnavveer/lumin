import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { Household } from '../src/contracts.js';
import { MOCK_BASE, MOCK_CODE, registerMockBenefitscal, resetMockState } from '../src/benefitscal/mockSite.js';
import { buildAnswers, PAGES, SECTIONS, SIGNATURE_PAGE_ID } from '../src/benefitscal/spec.js';
import { fieldForDocType, shouldStopAt } from '../src/benefitscal/filler.js';

const H: Household = {
  id: 'h1', orgId: 'o', phone: '+12135570002', firstName: 'Lin', county: 'los_angeles', size: 3,
  monthlyIncome: 2300, childrenUnder18: 1, pregnant: false, adultAge: 29, immigrationStatus: 'citizen', childrenAreCitizens: true,
};

describe('spec', () => {
  it('has the 9 sections, each with pages, and unique field names', () => {
    expect(SECTIONS).toHaveLength(9);
    for (const s of SECTIONS) expect(s.pages.length).toBeGreaterThan(0);
    const names = PAGES.flatMap((p) => p.fields.map((f) => f.name));
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => /^[a-z0-9_]+$/.test(n))).toBe(true);
    expect(new Set(PAGES.map((p) => p.id)).size).toBe(PAGES.length);
  });

  it('buildAnswers maps the household and leaves unknowns blank', () => {
    const a = buildAnswers(H);
    expect(a.first_name).toBe('Lin');
    expect(a.county).toBe('los_angeles');
    expect(a.household_size).toBe('3');
    expect(a.phone).toBe('(213) 557-0002');
    expect(a.gross_pay).toBe('2300');
    expect(a.has_job).toBe('yes');
    expect(a.dob).toBe('');
    expect(a.street).toBe('');
    expect(buildAnswers(H, { dob: '1997-04-12', gross_pay: 99 }).dob).toBe('1997-04-12');
    expect(buildAnswers(H, { gross_pay: 99 }).gross_pay).toBe('99');
  });

  it('never produces signature answers', () => {
    expect(Object.keys(buildAnswers(H)).filter((k) => k.startsWith('sig_'))).toEqual([]);
  });
});

describe('filler stop rule', () => {
  it('stops at the signature page only', () => {
    expect(shouldStopAt(SIGNATURE_PAGE_ID)).toBe(true);
    expect(shouldStopAt('ABNMI')).toBe(false);
    expect(shouldStopAt(null)).toBe(false);
  });
  it('maps doc types to upload inputs', () => {
    expect(fieldForDocType('id')).toBe('file_id');
    expect(fieldForDocType('ssn_card')).toBe('file_other');
  });
});

describe('mock site flow', () => {
  let app: Hono;
  let cookie = '';
  const req = async (path: string, init: { method?: string; body?: FormData | URLSearchParams } = {}) => {
    const res = await app.request(`${MOCK_BASE}${path}`, { ...init, headers: cookie ? { cookie } : {} });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0]!;
    return res;
  };
  const post = (path: string, data: Record<string, string>) => req(path, { method: 'POST', body: new URLSearchParams(data) });

  async function login() {
    await post('/signin', { email: 'a@b.test', password: 'x' });
    await post('/verify', { code: MOCK_CODE });
  }

  beforeEach(() => {
    resetMockState();
    cookie = '';
    app = new Hono();
    registerMockBenefitscal(app);
  });

  it('shows the demo banner and exposes the code after sign-in', async () => {
    const res = await req('/signin');
    expect(await res.text()).toContain('DEMO REPLICA: not BenefitsCal');
    expect((await req('/_last-code')).status).toBe(404);
    await post('/signin', { email: 'a@b.test', password: 'x' });
    expect(await (await req('/_last-code')).json()).toMatchObject({ email: 'a@b.test', code: MOCK_CODE });
  });

  it('rejects a wrong code and redirects unauthenticated users', async () => {
    expect((await req('/p/ABPRG')).status).toBe(302);
    await post('/signin', { email: 'a@b.test', password: 'x' });
    expect((await post('/verify', { code: '000000' })).status).toBe(400);
    expect((await req('/p/ABPRG')).headers.get('location')).toContain('/verify');
  });

  it('validates required fields inline and advances on valid posts', async () => {
    await login();
    const bad = await post('/p/ABPRG', {});
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain('data-error-for="county"');
    const ok = await post('/p/ABPRG', { county: 'fresno', apply_calfresh: 'on' });
    expect(ok.status).toBe(302);
    expect(ok.headers.get('location')).toContain('/p/ABNMI');
  });

  it('does not let you skip ahead to the signature page', async () => {
    await login();
    const res = await req(`/p/${SIGNATURE_PAGE_ID}`);
    expect(res.status).toBe(302);
  });

  it('reaches the signature page, and only an explicit POST /submit finishes', async () => {
    await login();
    const valid: Record<string, Record<string, string>> = {
      ABPRG: { county: 'fresno' }, ABNMI: { first_name: 'A', last_name: 'B', dob: '1990-01-01' },
      ABNHA: { street: '1 Main', city: 'Fresno', zip: '93701' }, ABHHS: { household_size: '2' },
    };
    for (const p of PAGES) {
      if (p.id === SIGNATURE_PAGE_ID) break;
      const res = await post(`/p/${p.id}`, valid[p.id] ?? {});
      expect(res.status, p.id).toBe(302);
    }
    const sig = await req(`/p/${SIGNATURE_PAGE_ID}`);
    expect(sig.status).toBe(200);
    const html = await sig.text();
    expect(html).toContain('data-page-id="ABPAP"');
    expect(html).toContain('name="sig_esign"');

    // posting to the page route never submits
    expect((await post(`/p/${SIGNATURE_PAGE_ID}`, { sig_rights: 'on', sig_esign: 'on' })).headers.get('location')).toContain('/p/ABPAP');
    expect((await req('/confirmation')).status).toBe(302);

    // incomplete signature is rejected
    expect((await post('/submit', { sig_first_name: 'A' })).status).toBe(400);

    const done = await post('/submit', { sig_rights: 'on', sig_esign: 'on', sig_type: 'applicant', sig_first_name: 'A', sig_last_name: 'B' });
    expect(done.status).toBe(302);
    expect(await (await req('/confirmation')).text()).toMatch(/MOCK-\d{8}/);
  });

  it('rejects oversized and wrong-type uploads', async () => {
    await login();
    for (const p of PAGES) {
      if (p.kind === 'upload') break;
      const valid: Record<string, Record<string, string>> = {
        ABPRG: { county: 'fresno' }, ABNMI: { first_name: 'A', last_name: 'B', dob: '1990-01-01' },
        ABNHA: { street: '1 Main', city: 'Fresno', zip: '93701' }, ABHHS: { household_size: '2' },
      };
      await post(`/p/${p.id}`, valid[p.id] ?? {});
    }
    const upload = async (file: File) => {
      const fd = new FormData();
      fd.set('file_id', file);
      return req('/p/APDMC', { method: 'POST', body: fd });
    };
    const big = await upload(new File([new Uint8Array(8 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' }));
    expect(big.status).toBe(400);
    expect(await big.text()).toContain('under 8 MB');
    const wrong = await upload(new File(['x'], 'a.exe', { type: 'application/octet-stream' }));
    expect(wrong.status).toBe(400);
    const good = await upload(new File([new Uint8Array(1024)], 'id.png', { type: 'image/png' }));
    expect(good.status).toBe(302);
  });
});
