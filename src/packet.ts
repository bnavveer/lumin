import type { PacketRoutes } from './contracts.js';
import { getHousehold } from './store.js';
import { supabaseIntakeRepo } from './intakeStore.js';
import { fieldsFromHousehold } from './intake.js';
import { screenApplications } from './applicationScreening.js';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** A review sheet and official filing routes. This is not a government application or signature. */
export const packetRoutes: PacketRoutes = {
  async renderPacket(householdId) {
    const household = await getHousehold(householdId);
    if (!household) throw new Error('Case not found');
    const intake = await supabaseIntakeRepo().get(householdId);
    const screening = screenApplications(intake?.fields ?? fieldsFromHousehold(household));
    const matches = screening.matches.filter(m => m.status !== 'not_eligible');
    return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Your application review · Lumin</title><style>body{font:18px/1.6 system-ui;max-width:48rem;margin:3rem auto;padding:0 1.25rem;color:#172c4e}h1,h2{line-height:1.2}li{margin-bottom:1.5rem}a{color:#154f96}small{color:#536170}</style>
      <h1>Your application review</h1><p>${esc(household.firstName || 'Your household')}, these are programs to explore from your saved answers.</p>
      <p><strong>No application has been filed.</strong> This review sheet is not a legal signature or a completed government form. Finish and sign the application on the official site, then save its confirmation receipt in your Lumin account.</p>
      <ul>${matches.map(m => `<li><h2>${esc(m.name)}</h2><p>${esc(m.reason)}</p><p>${esc(m.nextStep)}</p><a href="${esc(m.applicationUrl)}" rel="noreferrer">Continue on the official application site</a></li>`).join('')}</ul>
      <p><a href="/account">Open your Lumin account</a></p><small>The county or program makes the eligibility decision. You can print this page for reference.</small></html>`;
  },
  async sign() {
    throw Object.assign(new Error('Complete your signature on the official application site. Lumin has not submitted an application.'), { status: 409 });
  },
};
