import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  extFor, objectPath, MAX_BYTES, setDocumentsClient, setHostResolver, signedUrl, storeDocumentFromUrl,
} from '../src/documents.js';

const ORG = '00000000-0000-4000-8000-00000000a1d0';
const HID = 'h1';

function fakeClient(opts: { insertError?: string; uploadError?: string } = {}) {
  const upload = vi.fn(async () => ({ data: {}, error: opts.uploadError ? { message: opts.uploadError } : null }));
  const remove = vi.fn(async () => ({ data: [], error: null }));
  const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://signed.example/x' }, error: null }));
  const insert = vi.fn((row: Record<string, unknown>) => ({
    select: () => ({
      single: async () => opts.insertError
        ? { data: null, error: { message: opts.insertError } }
        : { data: { ...row, created_at: '2026-10-11T10:00:00+00:00' }, error: null },
    }),
  }));
  const client = {
    from: (t: string) => t === 'households'
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { org_id: ORG }, error: null }) }) }) }
      : { insert },
    storage: { from: () => ({ upload, remove, createSignedUrl }) },
  } as unknown as SupabaseClient;
  return { client, upload, remove, insert, createSignedUrl };
}

const okResponse = (bytes = 100, headers: Record<string, string> = {}) =>
  new Response(new Uint8Array(bytes), { status: 200, headers });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setHostResolver(async () => ['93.184.216.34']);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setDocumentsClient();
  setHostResolver();
});

describe('extFor / objectPath', () => {
  it('maps supported types and ignores params/case', () => {
    expect(extFor('image/jpeg')).toBe('jpg');
    expect(extFor('IMAGE/PNG; charset=binary')).toBe('png');
    expect(extFor('application/pdf')).toBe('pdf');
    expect(extFor('image/heic')).toBeUndefined();
  });
  it('builds org/household/doc paths', () => {
    expect(objectPath('o', 'h', 'd', 'image/webp')).toBe('o/h/d.webp');
    expect(() => objectPath('o', 'h', 'd', 'image/heic')).toThrow('[documents]');
  });
});

describe('storeDocumentFromUrl', () => {
  it('rejects HEIC without fetching', async () => {
    const { client } = fakeClient();
    setDocumentsClient(client);
    await expect(storeDocumentFromUrl(HID, 'https://x.example/a.heic', 'image/heic', 'id'))
      .rejects.toThrow('[documents] unsupported content type');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects non-https and private hosts without fetching', async () => {
    setDocumentsClient(fakeClient().client);
    await expect(storeDocumentFromUrl(HID, 'http://x.example/a.jpg', 'image/jpeg', 'id')).rejects.toThrow('https');
    await expect(storeDocumentFromUrl(HID, 'https://127.0.0.1/a.jpg', 'image/jpeg', 'id')).rejects.toThrow('not allowed');
    for (const u of ['https://[::1]/a', 'https://[fd00::1]/a', 'https://[::ffff:10.0.0.1]/a', 'https://100.64.0.1/a', 'https://0x7f.1/a', 'https://metadata.internal/a']) {
      await expect(storeDocumentFromUrl(HID, u, 'image/jpeg', 'id')).rejects.toThrow('not allowed');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects hostnames that resolve to private addresses', async () => {
    setDocumentsClient(fakeClient().client);
    setHostResolver(async () => ['93.184.216.34', '169.254.169.254']);
    await expect(storeDocumentFromUrl(HID, 'https://evil.example/a.jpg', 'image/jpeg', 'id')).rejects.toThrow('not allowed');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('re-validates redirect targets and refuses private ones', async () => {
    const { client, upload } = fakeClient();
    setDocumentsClient(client);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data' } }));
    await expect(storeDocumentFromUrl(HID, 'https://x.example/a.jpg', 'image/jpeg', 'id')).rejects.toThrow('not allowed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ redirect: 'manual' });
    expect(upload).not.toHaveBeenCalled();
  });
  it('follows public redirects', async () => {
    const { client, upload } = fakeClient();
    setDocumentsClient(client);
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/b.jpg' } }))
      .mockResolvedValueOnce(okResponse(64));
    await storeDocumentFromUrl(HID, 'https://x.example/a.jpg', 'image/jpeg', 'id');
    expect(String(fetchMock.mock.calls[1]![0])).toBe('https://x.example/b.jpg');
    expect(upload).toHaveBeenCalledTimes(1);
  });
  it('rejects oversize by content-length and by actual bytes', async () => {
    const { client, upload } = fakeClient();
    setDocumentsClient(client);
    fetchMock.mockResolvedValueOnce(okResponse(10, { 'content-length': String(MAX_BYTES + 1) }));
    await expect(storeDocumentFromUrl(HID, 'https://x.example/a.jpg', 'image/jpeg', 'id')).rejects.toThrow('too large');
    fetchMock.mockResolvedValueOnce(okResponse(MAX_BYTES + 1));
    await expect(storeDocumentFromUrl(HID, 'https://x.example/a.jpg', 'image/jpeg', 'id')).rejects.toThrow('too large');
    expect(upload).not.toHaveBeenCalled();
  });
  it('uploads with upsert false, inserts the row, returns the record', async () => {
    const { client, upload, insert } = fakeClient();
    setDocumentsClient(client);
    fetchMock.mockResolvedValueOnce(okResponse(2048));
    const rec = await storeDocumentFromUrl(HID, 'https://x.example/a.jpg', 'image/jpeg', 'paystub');
    expect(rec.storagePath).toMatch(new RegExp(`^${ORG}/${HID}/[0-9a-f-]{36}\\.jpg$`));
    expect(rec).toMatchObject({ householdId: HID, docType: 'paystub', contentType: 'image/jpeg', at: '2026-10-11T10:00:00.000Z' });
    expect(upload).toHaveBeenCalledWith(rec.storagePath, expect.any(Uint8Array), { contentType: 'image/jpeg', upsert: false });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id: rec.id, storage_path: rec.storagePath }));
  });
  it('removes the uploaded object if the insert fails', async () => {
    const { client, upload, remove } = fakeClient({ insertError: 'db down' });
    setDocumentsClient(client);
    fetchMock.mockResolvedValueOnce(okResponse(64));
    await expect(storeDocumentFromUrl(HID, 'https://x.example/a.png', 'image/png', 'id'))
      .rejects.toThrow('[documents] insert: db down');
    const path = (upload.mock.calls[0] as unknown[])[0];
    expect(remove).toHaveBeenCalledWith([path]);
  });
  it('signedUrl returns the signed url', async () => {
    const { client, createSignedUrl } = fakeClient();
    setDocumentsClient(client);
    expect(await signedUrl('o/h/d.jpg')).toBe('https://signed.example/x');
    expect(createSignedUrl).toHaveBeenCalledWith('o/h/d.jpg', 600);
  });
});
