// Staff routes for the document vault. Org-scoped like the other /api/staff/cases/:id routes.
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { requireStaff } from './auth.js';
import { getHousehold } from './store.js';
import { getVault, requestDocument, vaultSummaryText } from './vault.js';
import { startExtraction } from './docExtract.js';

const DocRequest = z.object({
  docType: z.enum(['id', 'paystub', 'lease', 'ssn_card', 'birth_cert', 'immigration', 'other']),
  reason: z.string().trim().min(1).max(300),
});

/* eslint-disable @typescript-eslint/no-explicit-any */
export function registerVaultRoutes(app: Hono<any>): void {
  const ownsCase = async (c: Context<any>, id: string): Promise<boolean> => {
    const h = await getHousehold(id);
    return Boolean(h && h.orgId === c.get('orgId'));
  };
  const fail = (c: Context<any>, what: string, err: unknown): Response => {
    console.error(`[vaultRoutes] ${what} failed:`, err instanceof Error ? err.message : err);
    return c.json({ error: `${what} failed` }, 502);
  };

  app.get('/api/staff/cases/:id/vault', requireStaff, async (c) => {
    const id = c.req.param('id');
    if (!(await ownsCase(c, id))) return c.json({ error: 'Not found' }, 404);
    try { return c.json(await getVault(id)); } catch (err) { return fail(c, 'Vault lookup', err); }
  });

  app.get('/api/staff/cases/:id/vault/summary', requireStaff, async (c) => {
    const id = c.req.param('id');
    if (!(await ownsCase(c, id))) return c.json({ error: 'Not found' }, 404);
    try { return c.json({ summary: await vaultSummaryText(id) }); } catch (err) { return fail(c, 'Vault summary', err); }
  });

  app.post('/api/staff/documents/:id/extract', requireStaff, async (c) => {
    const docId = c.req.param('id');
    try {
      // Resolve the owning household via the document's own record, then org-check it.
      const { vaultDb } = await import('./vault.js');
      const { data } = await vaultDb().from('documents').select('household_id').eq('id', docId).maybeSingle();
      const hid = (data as { household_id?: string } | null)?.household_id;
      if (!hid || !(await ownsCase(c, hid))) return c.json({ error: 'Not found' }, 404);
      return c.json(await startExtraction(docId));
    } catch (err) { return fail(c, 'Extraction', err); }
  });

  app.post('/api/staff/cases/:id/doc-requests', requireStaff, async (c) => {
    const id = c.req.param('id');
    if (!(await ownsCase(c, id))) return c.json({ error: 'Not found' }, 404);
    const parsed = DocRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'docType and reason (1-300 chars) are required' }, 400);
    try {
      await requestDocument(id, parsed.data.docType, parsed.data.reason);
      return c.json({ ok: true });
    } catch (err) { return fail(c, 'Document request', err); }
  });
}
