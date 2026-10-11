import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { setKeewanoFetch } from '../src/keewano.js';
import {
  compressForUpload, expiryFlags, getVault, markUploadedToApplication, missingForPrograms,
  requestDocument, setVaultClient, vaultSummaryText,
} from '../src/vault.js';
import { setStoreClient } from '../src/store.js';
import { fakeDb } from './_fakeDb.js';

const NOW = new Date('2026-10-11T12:00:00Z');
const H = 'h1';
const doc = (o: Record<string, unknown>) => ({ household_id: H, status: 'read', created_at: '2026-10-01T00:00:00Z', ...o });

beforeEach(() => { setKeewanoFetch((async () => new Response('{}', { status: 202 })) as unknown as typeof fetch); });
afterEach(() => { setVaultClient(); setStoreClient(); setKeewanoFetch(); });

describe('compressForUpload', () => {
  it('shrinks a big noisy image under the limit', async () => {
    const raw = Buffer.alloc(2400 * 2400 * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
    const big = await sharp(raw, { raw: { width: 2400, height: 2400, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
    const max = 500_000;
    expect(big.byteLength).toBeGreaterThan(max);
    const out = await compressForUpload(big, 'image/jpeg', max);
    expect(out.buffer.byteLength).toBeLessThanOrEqual(max);
    expect(out.resized).toBe(true);
  });
  it('passes small JPEG and PDFs through, rejects oversized PDF', async () => {
    const small = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    expect((await compressForUpload(small, 'image/jpeg')).resized).toBe(false);
    const pdf = Buffer.from('%PDF-1.4');
    expect((await compressForUpload(pdf, 'application/pdf')).buffer).toBe(pdf);
    await expect(compressForUpload(pdf, 'application/pdf', 4)).rejects.toThrow(/too large/);
  });
});

describe('expiry', () => {
  it('flags expiring within 7 days and expired', () => {
    expect(expiryFlags('2026-10-11', NOW)).toEqual({ expired: false, expiresSoon: true });
    expect(expiryFlags('2026-10-18', NOW)).toEqual({ expired: false, expiresSoon: true });
    expect(expiryFlags('2026-10-19', NOW)).toEqual({ expired: false, expiresSoon: false });
    expect(expiryFlags('2026-10-10', NOW)).toEqual({ expired: true, expiresSoon: false });
    expect(expiryFlags(null, NOW)).toEqual({ expired: false, expiresSoon: false });
  });
});

describe('vault queries', () => {
  it('missingForPrograms ignores expired, rejected and unreadable docs', async () => {
    const { client } = fakeDb({ documents: [
      doc({ id: 'a', doc_type: 'id', expires_at: '2030-01-01' }),
      doc({ id: 'b', doc_type: 'paystub', expires_at: '2026-10-01' }),
      doc({ id: 'c', doc_type: 'lease', status: 'rejected' }),
    ] });
    setVaultClient(client);
    expect(await missingForPrograms(H, ['calfresh'], NOW)).toEqual(['paystub', 'lease']);
    expect(await missingForPrograms(H, ['calworks'], NOW)).toEqual(['paystub', 'birth_cert']);
    expect(await missingForPrograms(H, ['medi_cal'], NOW)).toEqual(['paystub']);
  });

  it('getVault returns flags', async () => {
    const { client } = fakeDb({ documents: [doc({ id: 'a', doc_type: 'id', expires_at: '2026-10-14' })] });
    setVaultClient(client);
    const [d] = await getVault(H, NOW);
    expect(d).toMatchObject({ id: 'a', expiresSoon: true, expired: false, status: 'read' });
  });

  it('requestDocument inserts a request and logs DocsRequested', async () => {
    const f = fakeDb();
    setVaultClient(f.client); setStoreClient(f.client);
    await requestDocument(H, 'lease', 'needed for CalFresh');
    expect(f.tables.document_requests![0]).toMatchObject({ household_id: H, doc_type: 'lease' });
  });

  it('markUploadedToApplication appends programs once', async () => {
    const f = fakeDb({ documents: [doc({ id: 'a', doc_type: 'id', reused_for: [] })] });
    setVaultClient(f.client);
    await markUploadedToApplication('a', 'calfresh');
    await markUploadedToApplication('a', 'calfresh');
    expect(f.tables.documents![0]).toMatchObject({ status: 'uploaded_to_application', reused_for: ['calfresh'] });
  });

  it('vaultSummaryText summarizes held and missing docs', async () => {
    const { client } = fakeDb({ documents: [
      doc({ id: 'a', doc_type: 'id' }),
      doc({ id: 'b', doc_type: 'paystub', doc_date: '2026-09-30', extracted: { grossPay: 1240 } }),
    ] });
    setVaultClient(client);
    expect(await vaultSummaryText(H, ['calfresh'], NOW))
      .toBe('We have your ID and Sept pay stub ($1,240). Still need: rent receipt.');
  });
});
