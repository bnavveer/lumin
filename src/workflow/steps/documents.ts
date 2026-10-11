// Documents: compare the vault against what the BenefitsCal programs need; ask for anything missing.
import type { ApplicationProgram } from '../../../shared/chat.js';
import type { DocType, Program } from '../../contracts.js';
import { expiryFlags, missingFrom, type VaultDoc } from '../../vault.js';
import type { HeldDoc } from '../deps.js';
import type { Ask } from '../nextSteps.js';
import { isBenefitsCal } from '../programs.js';
import type { StepCtx, StepOutcome } from './context.js';

export const DOC_LABEL: Record<DocType, string> = {
  id: 'Photo ID', paystub: 'Recent pay stub', lease: 'Lease or rent receipt', ssn_card: 'Social Security card',
  birth_cert: 'Birth certificate', immigration: 'Immigration papers', other: 'Other document',
};
export const DOC_TYPES = Object.keys(DOC_LABEL) as DocType[];

// The person uploaded it; "needs_review" (vision couldn't confirm every field) still counts as on file.
const asVault = (d: HeldDoc): VaultDoc => ({
  id: d.id, docType: d.docType, status: d.status === 'needs_review' ? 'received' : d.status, extracted: d.extracted, docDate: null, expiresAt: d.expiresAt,
  ...expiryFlags(d.expiresAt), reusedFor: [], createdAt: new Date().toISOString(),
});

export function missingDocs(held: HeldDoc[], programs: ApplicationProgram[]): DocType[] {
  const bc = programs.filter(isBenefitsCal) as Program[];
  if (!bc.length) return [];
  return missingFrom(held.map(asVault), bc);
}

export function extractedSummary(x: Record<string, unknown> | null): string | null {
  if (!x) return null;
  const parts = Object.entries(x)
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object')
    .slice(0, 6).map(([k, v]) => `${k}: ${String(v)}`);
  return parts.length ? `Read: ${parts.join(', ')}` : null;
}

export async function runDocuments(ctx: StepCtx): Promise<StepOutcome> {
  const held = await ctx.deps.docs.list(ctx.household.id);
  const evidenced = new Set((ctx.step.meta.evidencedDocs as string[] | undefined) ?? []);
  for (const d of held) {
    if (evidenced.has(d.id)) continue;
    const url = await ctx.deps.docs.signedUrl(d.storagePath).catch(() => null);
    await ctx.evidence({
      kind: 'document', title: DOC_LABEL[d.docType] ?? d.docType, url,
      detail: extractedSummary(d.extracted) ?? `Status: ${d.status}`, source: `vault:${d.id}`,
    });
    evidenced.add(d.id);
  }
  const missing = missingDocs(held, ctx.wf.programs);
  const meta = { ...ctx.step.meta, evidencedDocs: [...evidenced] };
  if (!missing.length) {
    return { status: 'done', summary: held.length ? `All required documents are in your vault (${held.length} on file).` : 'No documents needed for this step.', meta };
  }
  if (ctx.step.meta.continueWithout === true) {
    return { status: 'done', summary: `Continuing without: ${missing.map(t => DOC_LABEL[t]).join(', ')}. You can send them to the county later.`, meta };
  }
  const asks: Ask[] = [
    ...missing.map((t): Ask => ({
      title: `Upload your ${DOC_LABEL[t].toLowerCase()}`,
      detail: 'A clear photo or PDF works. Aid reads it and attaches it to your application.',
      action: { type: 'upload', label: `Upload ${DOC_LABEL[t].toLowerCase()}`, url: null, stepId: ctx.step.id, docType: t },
    })),
    {
      title: 'Continue without the missing documents',
      detail: 'Aid can still fill the application; the county will ask for them later.',
      action: { type: 'approve', label: 'Continue without', url: null, stepId: ctx.step.id },
    },
  ];
  return {
    status: 'waiting_on_you',
    summary: `Still need: ${missing.map(t => DOC_LABEL[t]).join(', ')}.${held.length ? ` Already have ${held.length} document(s).` : ''}`,
    meta: { ...meta, asks, missing },
  };
}
