import { describe, expect, it } from 'vitest';
import { toYYYYMMDDInTimeZone } from './dateUtils';

describe('calendar-day semantics', () => {
  it('keeps the local calendar day across representative timezones', () => {
    const instant = new Date('2026-08-25T23:30:00.000Z');
    expect(toYYYYMMDDInTimeZone(instant, 'UTC')).toBe('2026-08-25');
    expect(toYYYYMMDDInTimeZone(instant, 'Atlantic/Canary')).toBe('2026-08-26');
    expect(toYYYYMMDDInTimeZone(instant, 'Europe/Berlin')).toBe('2026-08-26');
    expect(toYYYYMMDDInTimeZone(instant, 'America/New_York')).toBe('2026-08-25');
    expect(toYYYYMMDDInTimeZone(instant, 'Asia/Tokyo')).toBe('2026-08-26');
  });

  it('handles DST transition instants without UTC round-trip date drift', () => {
    expect(toYYYYMMDDInTimeZone(new Date('2026-03-29T00:30:00.000Z'), 'Europe/Berlin')).toBe('2026-03-29');
    expect(toYYYYMMDDInTimeZone(new Date('2026-03-29T22:30:00.000Z'), 'Europe/Berlin')).toBe('2026-03-30');
    expect(toYYYYMMDDInTimeZone(new Date('2026-10-25T00:30:00.000Z'), 'Europe/Berlin')).toBe('2026-10-25');
    expect(toYYYYMMDDInTimeZone(new Date('2026-10-25T23:30:00.000Z'), 'Europe/Berlin')).toBe('2026-10-26');
  });
});
