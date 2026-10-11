import { describe, it, expect } from 'vitest';
import { v5 as uuidv5 } from 'uuid';
import { generateSeed } from '../src/seedData.js';
import { DEMO_ORG_ID } from '../src/supabase.js';

const NOW = 1_800_000_000;
const seed = generateSeed({ nowSec: NOW });
const by = (t: string) => seed.filter(s => s.tag === t);
const demo = (p: string) => seed.find(s => s.pattern === p)!;
const types = (s: (typeof seed)[number]) => s.events.map(e => e.event.type);

describe('generateSeed', () => {
  it('is deterministic', () => {
    expect(generateSeed({ nowSec: NOW })).toEqual(seed);
  });
  it('has the right cohort sizes', () => {
    expect([by('baseline').length, by('aid').length, by('demo').length]).toEqual([60, 60, 4]);
  });
  it('ids are uuidv5 of the phone, org is demo org, all LA', () => {
    for (const s of seed) {
      expect(s.household.id).toBe(uuidv5(s.household.phone, uuidv5.URL));
      expect(s.household.orgId).toBe(DEMO_ORG_ID);
      expect(s.household.county).toBe('los_angeles');
    }
    expect(new Set(seed.map(s => s.household.id)).size).toBe(124);
  });
  it('timestamps are <= now and sorted', () => {
    for (const s of seed) {
      const ats = s.events.map(e => e.at);
      expect(Math.max(...ats)).toBeLessThanOrEqual(NOW);
      expect(ats).toEqual([...ats].sort((a, b) => a - b));
    }
  });
  it('strings are at most 256 chars', () => {
    for (const s of seed) for (const { event } of s.events) {
      if ('value' in event && typeof event.value === 'string') expect(event.value.length).toBeLessThanOrEqual(256);
    }
  });
  it('aid cohort submits faster than baseline', () => {
    const gap = (s: (typeof seed)[number]) => {
      const a = s.events.find(e => e.event.type === 'ApplicationSubmitted');
      return a ? a.at - s.events.find(e => e.event.type === 'Screened')!.at : undefined;
    };
    const avg = (xs: Array<number | undefined>) => { const v = xs.filter((x): x is number => x !== undefined); return v.reduce((a, b) => a + b, 0) / v.length; };
    expect(avg(by('aid').map(gap))).toBeLessThan(avg(by('baseline').map(gap)) / 10);
    const never = by('baseline').filter(s => gap(s) === undefined).length;
    expect(never).toBeGreaterThan(5);
  });
  it('rosa: interview in the future, unconfirmed, uses demoPhone', () => {
    const custom = generateSeed({ nowSec: NOW, demoPhone: '+15551234567' }).find(s => s.pattern === 'interview_unconfirmed')!;
    expect(custom.household.phone).toBe('+15551234567');
    const r = demo('interview_unconfirmed');
    expect(r.household.phone).toBe('+12135570000');
    const iv = r.events.find(e => e.event.type === 'InterviewScheduled')!.event as { at: number };
    expect(iv.at).toBe(NOW + 20 * 3600);
    expect(types(r)).not.toContain('InterviewConfirmed');
  });
  it('james, lin, marcus patterns', () => {
    const j = demo('docs_stalled');
    const req = j.events.find(e => e.event.type === 'DocsRequested')!;
    expect(req.at).toBe(NOW - 4 * 86400);
    expect(j.events.filter(e => e.at > req.at)).toHaveLength(0);
    const l = demo('signed_not_submitted');
    expect(types(l)).toContain('PacketSigned');
    expect(types(l)).not.toContain('ApplicationSubmitted');
    const m = demo('waitlist_closed');
    expect(m.events.find(e => e.event.type === 'WaitlistStatus')).toMatchObject({ event: { value: 'closed' } });
    expect(m.events.find(e => e.event.type === 'WaitlistStatus')!.at).toBeLessThanOrEqual(NOW - 8 * 86400 + 3600);
  });
  it('demo households have 3-6 messages', () => {
    for (const s of by('demo')) {
      expect(s.messages.length).toBeGreaterThanOrEqual(3);
      expect(s.messages.length).toBeLessThanOrEqual(6);
    }
  });
});
