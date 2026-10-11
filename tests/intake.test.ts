import { describe, expect, it } from 'vitest';
import {
  confirmationText, householdId, mergeFields, missingFields, normalizePhone, parseConfirmationReply, toHousehold,
  type IntakeFields,
} from '../src/intake.js';

const full: IntakeFields = {
  firstName: 'Maria', county: 'los_angeles', size: 3, monthlyIncome: 1850, childrenUnder18: 2, pregnant: false,
  adultAge: 31, immigrationStatus: 'undocumented', childrenAreCitizens: true,
};

describe('intake', () => {
  it('lists what is still missing, and firstName is optional', () => {
    expect(missingFields({ county: 'los_angeles' })).toContain('monthlyIncome');
    const { firstName: _n, ...noName } = full;
    expect(missingFields(noName)).toEqual([]);
  });

  it('merges without letting undefined erase an earlier answer', () => {
    expect(mergeFields({ size: 3, pregnant: false }, { size: 4, pregnant: undefined })).toEqual({ size: 4, pregnant: false });
  });

  it('builds a household only when complete', () => {
    expect(() => toHousehold('h', 'o', '+12135550100', { size: 2 })).toThrow(/missing/);
    expect(toHousehold('h', 'o', '+12135550100', full)).toMatchObject({ id: 'h', orgId: 'o', size: 3, monthlyIncome: 1850 });
  });

  it('household id is stable per phone (same id the rest of the system uses)', () => {
    expect(householdId('+12135550100')).toBe(householdId('+12135550100'));
    expect(householdId('+12135550100')).not.toBe(householdId('+12135550101'));
  });

  it('confirmation text shows the answers but never immigration status', () => {
    const t = confirmationText(full, 'sms');
    expect(t).toMatch(/Los Angeles/);
    expect(t).toMatch(/\$1,850\/month/);
    expect(t).toMatch(/Reply YES/);
    expect(t).not.toMatch(/undocumented|immigration/i);
  });

  it('web-origin confirmation explains where it came from and how to say it was not them', () => {
    expect(confirmationText(full, 'web')).toMatch(/website/);
    expect(confirmationText(full, 'web')).toMatch(/Reply NO/);
  });

  it('parses replies deterministically and does not treat "ok" as a YES', () => {
    for (const y of ['YES', 'yes!', ' Yep ', 'sí', 'Correct.']) expect(parseConfirmationReply(y)).toBe('yes');
    for (const n of ['no', 'Not me', 'wrong number']) expect(parseConfirmationReply(n)).toBe('no');
    expect(parseConfirmationReply('STOP')).toBe('stop');
    for (const x of ['ok', 'yes but my income is 2000', 'who is this?']) expect(parseConfirmationReply(x)).toBeNull();
  });

  it('normalizes US phone numbers to E.164', () => {
    expect(normalizePhone('(213) 555-0100')).toBe('+12135550100');
    expect(normalizePhone('+1 213 555 0100')).toBe('+12135550100');
    expect(() => normalizePhone('555')).toThrow(RangeError);
  });
});
