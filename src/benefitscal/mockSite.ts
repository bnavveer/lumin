// MOCK BenefitsCal replica served by our API at /mock/benefitscal. Plain server-rendered HTML, in-memory state.
// Not BenefitsCal, not affiliated with CalSAWS or the State of California. No data leaves this process.
import { randomBytes, randomInt } from 'node:crypto';
import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import {
  MAX_UPLOAD_BYTES, PAGES, SECTIONS, SIGNATURE_PAGE_ID, UPLOAD_TYPES,
  type Answers, type FieldSpec, type FlatPage,
} from './spec.js';

export const MOCK_BASE = '/mock/benefitscal';
export const MOCK_CODE = '123456';
const COOKIE = 'mbc_sid';
const MAX_SESSIONS = 200;

interface UploadedFile { field: string; name: string; size: number; type: string }
interface Session {
  email: string;
  verified: boolean;
  answers: Record<string, string | boolean>;
  uploads: UploadedFile[];
  reached: number;           // furthest page index the user may open
  confirmation?: string;
}

const sessions = new Map<string, Session>();
let lastCode: { email: string; code: string; at: string } | null = null;

export const resetMockState = (): void => { sessions.clear(); lastCode = null; };

const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const BANNER = 'DEMO REPLICA: not BenefitsCal, not affiliated with CalSAWS or the State of California. No data is sent anywhere.';

const CSS = `
:root{--ink:#1d2433;--muted:#5b6475;--line:#d5d9e2;--bg:#f4f6fa;--brand:#1f5fa8;--err:#b3261e}
*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--ink);background:var(--bg)}
.banner{background:#b3261e;color:#fff;font-weight:700;text-align:center;padding:12px 16px;font-size:15px;letter-spacing:.2px}
.wrap{max-width:46rem;margin:0 auto;padding:20px 16px 60px}
header.top{display:flex;justify-content:space-between;align-items:center;padding:6px 0 14px}
header.top b{font-size:20px}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:22px;margin-top:12px}
.progress{height:10px;background:#e3e7ef;border-radius:99px;overflow:hidden;margin:6px 0}
.progress>i{display:block;height:100%;background:var(--brand)}
.step{color:var(--muted);font-size:14px}
.rail{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 0;padding:0;list-style:none;font-size:12px}
.rail li{padding:3px 8px;border-radius:99px;background:#e3e7ef;color:var(--muted)}
.rail li.cur{background:var(--brand);color:#fff}.rail li.done{background:#d6e8d6;color:#1c5a1c}
h1{font-size:24px;margin:.2em 0 .4em}label,.lbl{display:block;font-weight:600;margin:14px 0 4px}
input[type=text],input[type=password],input[type=number],input[type=date],select{width:100%;padding:10px;border:1px solid #9aa3b5;border-radius:6px;font:inherit;background:#fff}
input[type=file]{width:100%}.opt{display:flex;gap:8px;align-items:center;margin:6px 0;font-weight:400}.opt input{width:auto}
.help{color:var(--muted);font-size:14px;margin-top:2px}.err{color:var(--err);font-size:14px;margin-top:4px;font-weight:600}
.has-err input[type=text],.has-err input[type=number],.has-err input[type=date],.has-err select{border-color:var(--err)}
.nav{display:flex;justify-content:space-between;align-items:center;margin-top:24px}
button,.btn{background:var(--brand);color:#fff;border:0;border-radius:6px;padding:11px 22px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
a.back{color:var(--brand)}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
th{width:45%;font-weight:600;color:var(--muted)}.sechead{margin:18px 0 4px;font-size:16px;color:var(--brand)}
.legal{max-height:9rem;overflow:auto;border:1px solid var(--line);padding:10px;font-size:13px;color:var(--muted);background:#fafbfd}
.ok{color:#1c5a1c;font-size:30px;font-weight:700}`;

function shell(title: string, pageId: string, body: string, extra = ''): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(title)} - Demo Benefits Application</title><style>${CSS}</style></head>` +
    `<body data-page-id="${esc(pageId)}"><div class="banner" role="alert">${BANNER}</div><div class="wrap">` +
    `<header class="top"><b>Demo Benefits Application</b><span class="step">Practice site</span></header>${extra}${body}</div></body></html>`;
}

function progress(page: FlatPage): string {
  const pct = Math.round(((page.index + 1) / PAGES.length) * 100);
  const rail = SECTIONS.map((s, i) => `<li class="${i === page.sectionIndex ? 'cur' : i < page.sectionIndex ? 'done' : ''}">${i + 1}. ${esc(s.title)}</li>`).join('');
  return `<div class="step">Step ${page.sectionIndex + 1} of ${SECTIONS.length}: ${esc(page.sectionTitle)}</div>` +
    `<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div><ol class="rail">${rail}</ol>`;
}

function renderField(f: FieldSpec, answers: Record<string, string | boolean>, error?: string): string {
  const v = answers[f.name];
  const req = f.required ? ' <span aria-hidden="true">*</span>' : '';
  const err = error ? `<div class="err" data-error-for="${f.name}" role="alert">${esc(error)}</div>` : '';
  const cls = error ? ' has-err' : '';
  const help = f.help ? `<div class="help">${esc(f.help)}</div>` : '';
  const common = `name="${f.name}" id="f_${f.name}" data-field="${f.name}"`;
  switch (f.type) {
    case 'select':
      return `<div class="${cls}"><label for="f_${f.name}">${esc(f.label)}${req}</label><select ${common}><option value="">-Select One-</option>` +
        (f.options ?? []).map((o) => `<option value="${esc(o.value)}"${v === o.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('') + `</select>${help}${err}</div>`;
    case 'radio':
      return `<fieldset class="${cls}" style="border:0;padding:0;margin:0"><legend class="lbl">${esc(f.label)}${req}</legend>` +
        (f.options ?? []).map((o) => `<label class="opt"><input type="radio" name="${f.name}" data-field="${f.name}" value="${esc(o.value)}"${v === o.value ? ' checked' : ''}> ${esc(o.label)}</label>`).join('') + `${help}${err}</fieldset>`;
    case 'checkbox':
      return `<div class="${cls}"><label class="opt"><input type="checkbox" ${common} value="on"${v === true || v === 'on' ? ' checked' : ''}> ${esc(f.label)}${req}</label>${err}</div>`;
    case 'file':
      return `<div class="${cls}"><label for="f_${f.name}">${esc(f.label)}</label><input type="file" ${common} multiple accept=".jpg,.jpeg,.png,.pdf">${err}</div>`;
    default: {
      const type = f.type === 'text' ? 'text' : f.type;
      const ml = f.maxLength ? ` maxlength="${f.maxLength}"` : '';
      const num = f.type === 'number' ? ' min="0" step="any"' : '';
      return `<div class="${cls}"><label for="f_${f.name}">${esc(f.label)}${req}</label><input type="${type}" ${common}${ml}${num} value="${esc(v === true ? '' : v)}">${help}${err}</div>`;
    }
  }
}

export function validatePage(page: FlatPage, data: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of page.fields) {
    const raw = data[f.name];
    const val = typeof raw === 'string' ? raw.trim() : raw;
    const empty = val === undefined || val === '' || val === false;
    if (f.required && empty) { errors[f.name] = `Please make sure to enter ${f.label}.`; continue; }
    if (empty || typeof val !== 'string') continue;
    if (f.type === 'number' && !(Number.isFinite(Number(val)) && Number(val) >= 0)) errors[f.name] = `${f.label} must be a number, 0 or more.`;
    else if (f.type === 'date' && Number.isNaN(Date.parse(val))) errors[f.name] = `${f.label} must be a valid date.`;
    else if ((f.type === 'select' || f.type === 'radio') && !(f.options ?? []).some((o) => o.value === val)) errors[f.name] = `Choose a valid option for ${f.label}.`;
    else if (f.maxLength && val.length > f.maxLength) errors[f.name] = `${f.label} is limited to ${f.maxLength} characters.`;
  }
  return errors;
}

function getSession(c: Context): Session | undefined {
  const sid = getCookie(c, COOKIE);
  return sid ? sessions.get(sid) : undefined;
}

function newSession(c: Context, email: string): Session {
  if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value as string);
  const sid = randomBytes(18).toString('hex');
  const s: Session = { email, verified: false, answers: {}, uploads: [], reached: 0 };
  sessions.set(sid, s);
  setCookie(c, COOKIE, sid, { path: MOCK_BASE, httpOnly: true, sameSite: 'Lax' });
  return s;
}

const href = (p: string): string => `${MOCK_BASE}${p}`;
const html = (c: Context, body: string, status: 200 | 400 = 200) => c.html(body, status);

function signInPage(error = ''): string {
  return shell('Sign in', 'signin', `<div class="card"><h1>Sign in</h1><p class="help">Practice sign-in: any email and password are accepted.</p>` +
    (error ? `<div class="err" role="alert">${esc(error)}</div>` : '') +
    `<form method="post" action="${href('/signin')}"><label for="email">Email</label><input type="text" id="email" name="email" autocomplete="off">` +
    `<label for="password">Password</label><input type="password" id="password" name="password" autocomplete="off">` +
    `<div class="nav"><span></span><button type="submit">Sign in</button></div></form></div>`);
}

function verifyPage(email: string, error = ''): string {
  return shell('Verify', 'verify', `<div class="card"><h1>Enter your verification code</h1><p>We sent a 6-digit code to ${esc(email)}.</p>` +
    (error ? `<div class="err" role="alert" data-error-for="code">${esc(error)}</div>` : '') +
    `<form method="post" action="${href('/verify')}"><label for="code">6-digit code</label><input type="text" id="code" name="code" inputmode="numeric" maxlength="6" autocomplete="off">` +
    `<div class="nav"><span></span><button type="submit">Verify</button></div></form></div>`);
}

function formPage(page: FlatPage, s: Session, errors: Record<string, string> = {}): string {
  const prev = page.index > 0 ? `<a class="back" href="${href('/p/' + PAGES[page.index - 1]!.id)}">Back to Previous Page</a>` : '<span></span>';
  const upload = page.kind === 'upload';
  const files = upload && s.uploads.length ? `<h2>Uploaded</h2><ul>${s.uploads.map((u) => `<li data-uploaded="${esc(u.field)}">${esc(u.name)} (${Math.ceil(u.size / 1024)} KB)</li>`).join('')}</ul>` : '';
  const errBanner = Object.keys(errors).length ? `<div class="err" role="alert" data-error-summary>Please fix the highlighted fields.</div>` : '';
  return shell(page.title, page.id,
    `<div class="card"><h1>${esc(page.title)}</h1>${page.prompt ? `<p>${esc(page.prompt)}</p>` : ''}${errBanner}` +
    `<form method="post" action="${href('/p/' + page.id)}"${upload ? ' enctype="multipart/form-data"' : ''}>` +
    page.fields.map((f) => renderField(f, s.answers, errors[f.name])).join('') + files +
    `<div class="nav">${prev}<button type="submit" data-action="next">Next</button></div></form></div>`, progress(page));
}

function optionLabel(f: FieldSpec, v: string | boolean | undefined): string {
  if (v === true) return 'Yes';
  if (v === undefined || v === '' || v === false) return '';
  return f.options?.find((o) => o.value === v)?.label ?? String(v);
}

function reviewPage(page: FlatPage, s: Session): string {
  const rows = SECTIONS.flatMap((sec) => {
    const fields = sec.pages.filter((p) => p.kind === 'form').flatMap((p) => p.fields);
    if (!fields.length) return [];
    return [`<h3 class="sechead">${esc(sec.title)}</h3><table>` + fields.map((f) =>
      `<tr data-review="${f.name}"><th>${esc(f.label)}</th><td>${esc(optionLabel(f, s.answers[f.name]) || '(not provided)')}</td></tr>`).join('') + '</table>'];
  }).join('');
  const up = `<h3 class="sechead">Document Upload</h3><table>${s.uploads.length
    ? s.uploads.map((u) => `<tr data-review="${esc(u.field)}"><th>${esc(u.field)}</th><td>${esc(u.name)}</td></tr>`).join('')
    : '<tr><td>No documents uploaded</td></tr>'}</table>`;
  return shell(page.title, page.id, `<div class="card"><h1>${esc(page.title)}</h1><p>${esc(page.prompt)}</p>${rows}${up}` +
    `<form method="post" action="${href('/p/' + page.id)}"><div class="nav"><a class="back" href="${href('/p/' + PAGES[page.index - 1]!.id)}">Back to Previous Page</a>` +
    `<button type="submit" data-action="next">Next</button></div></form></div>`, progress(page));
}

function signaturePage(page: FlatPage, s: Session, errors: Record<string, string> = {}): string {
  const first = page.fields.filter((f) => f.name === 'sig_rights').map((f) => renderField(f, s.answers, errors[f.name])).join('');
  const rest = page.fields.filter((f) => f.name !== 'sig_rights').map((f) => renderField(f, s.answers, errors[f.name])).join('');
  const today = new Date().toLocaleDateString('en-US');
  return shell(page.title, page.id, `<div class="card"><h1>${esc(page.prompt)}</h1>` +
    `<div class="legal">By signing, you declare under penalty of perjury that the information is true, accurate and complete; that you have read your rights, program rules and penalties; ` +
    `and you consent to information sharing and Medi-Cal third-party recovery. (Practice text for the demo replica.)</div>` +
    `<form method="post" action="${href('/submit')}">${first}${rest}<label for="sig_date">Date</label><input type="text" id="sig_date" value="${today}" disabled>` +
    `<div class="nav"><a class="back" href="${href('/p/' + PAGES[page.index - 1]!.id)}">Back to Previous Page</a><button type="submit" data-action="submit">Submit application</button></div></form></div>`, progress(page));
}

async function readForm(c: Context): Promise<Record<string, unknown>> {
  const body = await c.req.parseBody({ all: true }).catch(() => ({} as Record<string, unknown>));
  return body as Record<string, unknown>;
}

function collect(page: FlatPage, body: Record<string, unknown>): Answers {
  const out: Answers = {};
  for (const f of page.fields) {
    const raw = body[f.name];
    if (f.type === 'checkbox') out[f.name] = raw === 'on' || raw === 'true';
    else if (f.type !== 'file') out[f.name] = typeof raw === 'string' ? raw.trim() : '';
  }
  return out;
}

async function collectUploads(page: FlatPage, body: Record<string, unknown>): Promise<{ files: UploadedFile[]; errors: Record<string, string> }> {
  const files: UploadedFile[] = [];
  const errors: Record<string, string> = {};
  for (const f of page.fields) {
    const raw = body[f.name];
    const list = (Array.isArray(raw) ? raw : [raw]).filter((x): x is File => typeof x === 'object' && x !== null && 'size' in x && (x as File).size > 0);
    for (const file of list) {
      const type = (file.type || '').split(';')[0]!.toLowerCase();
      if (!UPLOAD_TYPES[type]) { errors[f.name] = `${file.name}: only JPEG, PNG or PDF files are allowed.`; continue; }
      if (file.size > MAX_UPLOAD_BYTES) { errors[f.name] = `${file.name}: each file must be under 8 MB.`; continue; }
      files.push({ field: f.name, name: file.name, size: file.size, type });
    }
  }
  return { files, errors };
}

function gate(c: Context): Session | Response {
  const s = getSession(c);
  if (!s) return c.redirect(href('/signin'));
  if (!s.verified) return c.redirect(href('/verify'));
  return s;
}

export function registerMockBenefitscal(app: Hono<any>): void {
  const r = (path: string) => `${MOCK_BASE}${path}`;

  app.get(MOCK_BASE, (c) => c.redirect(href('/signin')));
  app.get(r('/signin'), (c) => html(c, signInPage()));
  app.post(r('/signin'), async (c) => {
    const body = await readForm(c);
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (!email || typeof body.password !== 'string' || !body.password) return html(c, signInPage('Enter an email and a password.'), 400);
    newSession(c, email);
    lastCode = { email, code: MOCK_CODE, at: new Date().toISOString() };
    console.log(`[mock-benefitscal] verification code for ${email}: ${MOCK_CODE}`);
    return c.redirect(href('/verify'));
  });

  // Demo-only helper: stands in for the email inbox / AgentMail.
  app.get(r('/_last-code'), (c) => lastCode ? c.json(lastCode) : c.json({ code: null }, 404));

  app.get(r('/verify'), (c) => {
    const s = getSession(c);
    if (!s) return c.redirect(href('/signin'));
    return html(c, verifyPage(s.email));
  });
  app.post(r('/verify'), async (c) => {
    const s = getSession(c);
    if (!s) return c.redirect(href('/signin'));
    const body = await readForm(c);
    if (body.code !== MOCK_CODE) return html(c, verifyPage(s.email, 'That code is not correct. Please try again.'), 400);
    s.verified = true;
    return c.redirect(href('/p/' + PAGES[0]!.id));
  });

  app.get(r('/p/:id'), (c) => {
    const s = gate(c);
    if (s instanceof Response) return s;
    const page = PAGES.find((p) => p.id === c.req.param('id'));
    if (!page) return c.notFound();
    if (page.index > s.reached) return c.redirect(href('/p/' + PAGES[s.reached]!.id));
    if (page.kind === 'review') return html(c, reviewPage(page, s));
    if (page.kind === 'signature') return html(c, signaturePage(page, s));
    return html(c, formPage(page, s));
  });

  app.post(r('/p/:id'), async (c) => {
    const s = gate(c);
    if (s instanceof Response) return s;
    const page = PAGES.find((p) => p.id === c.req.param('id'));
    if (!page) return c.notFound();
    if (page.kind === 'signature') return c.redirect(href('/p/' + page.id)); // signing only happens via POST /submit
    if (page.index > s.reached) return c.redirect(href('/p/' + PAGES[s.reached]!.id));
    const body = await readForm(c);
    let errors: Record<string, string> = {};
    if (page.kind === 'form') {
      const answers = collect(page, body);
      errors = validatePage(page, answers);
      Object.assign(s.answers, answers);
    } else if (page.kind === 'upload') {
      const { files, errors: upErr } = await collectUploads(page, body);
      errors = upErr;
      if (!Object.keys(errors).length) {
        s.uploads = [...s.uploads.filter((u) => !files.some((f) => f.field === u.field)), ...files];
      }
    }
    if (Object.keys(errors).length) return html(c, formPage(page, s, errors), 400);
    const next = PAGES[page.index + 1];
    if (!next) return c.redirect(href('/p/' + page.id));
    s.reached = Math.max(s.reached, next.index);
    return c.redirect(href('/p/' + next.id));
  });

  // The only way to finish: an explicit POST with a completed signature block.
  app.post(r('/submit'), async (c) => {
    const s = gate(c);
    if (s instanceof Response) return s;
    const sigPage = PAGES.find((p) => p.id === SIGNATURE_PAGE_ID)!;
    if (s.reached < sigPage.index) return c.redirect(href('/p/' + PAGES[s.reached]!.id));
    const body = await readForm(c);
    const answers = collect(sigPage, body);
    const errors = validatePage(sigPage, answers);
    Object.assign(s.answers, answers);
    if (Object.keys(errors).length) return html(c, signaturePage(sigPage, s, errors), 400);
    s.confirmation = `MOCK-${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
    console.log(`[mock-benefitscal] submitted ${s.confirmation}`);
    return c.redirect(href('/confirmation'));
  });

  app.get(r('/confirmation'), (c) => {
    const s = gate(c);
    if (s instanceof Response) return s;
    if (!s.confirmation) return c.redirect(href('/p/' + PAGES[s.reached]!.id));
    return html(c, shell('Confirmation', 'confirmation', `<div class="card"><div class="ok">Application submitted (demo)</div>` +
      `<p>Your confirmation number is <b data-confirmation>${esc(s.confirmation)}</b>.</p><p class="help">Nothing was sent to any agency.</p></div>`));
  });
}
