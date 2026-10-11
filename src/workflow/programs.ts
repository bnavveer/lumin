// Program names and application URLs, taken from the screening rules so they never drift.
import type { ApplicationProgram } from '../../shared/chat.js';
import type { County, Program } from '../contracts.js';
import { screenApplications } from '../applicationScreening.js';

/** Programs that share one BenefitsCal application, which Aid fills in a browser. */
export const BENEFITSCAL: readonly ApplicationProgram[] = ['calfresh', 'medi_cal', 'calworks'];
export const isBenefitsCal = (p: ApplicationProgram): boolean => BENEFITSCAL.includes(p);

const INFO = new Map(screenApplications({}).matches.map(m => [m.program, { name: m.name, applicationUrl: m.applicationUrl }]));

export function programName(p: ApplicationProgram): string {
  return INFO.get(p)?.name ?? p;
}
export function applicationUrl(p: ApplicationProgram): string {
  return INFO.get(p)?.applicationUrl ?? 'https://benefitscal.com/';
}
export const ALL_PROGRAMS: readonly ApplicationProgram[] = [...INFO.keys()];

const CASE_PROGRAMS: ReadonlySet<string> = new Set<Program>(['calfresh', 'medi_cal', 'calworks', 'general_relief', 'cfap', 'section8']);
/** Narrow to the programs the Keewano case model knows (contracts.Program). */
export const asCaseProgram = (p: ApplicationProgram): Program | null => (CASE_PROGRAMS.has(p) ? (p as Program) : null);

export const COUNTY_NAME: Record<County, string> = { los_angeles: 'Los Angeles County', san_francisco: 'San Francisco County' };

export function joinNames(ps: readonly ApplicationProgram[]): string {
  const names = ps.map(programName);
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} + ${names.at(-1)}`;
}
