import { describe, expect, it } from 'vitest';
import { SchedulingError } from '../../src/domain/scheduling';
import { parseTelegramCapture } from './capture';

describe('Telegram quick capture', () => {
  it('defaults undated text to today and marks the default', () => {
    expect(parseTelegramCapture('Write launch notes', '2026-07-18')).toEqual({
      title: 'Write launch notes', schedulePrecision: 'day', scheduledFor: '2026-07-18', defaultedToToday: true
    });
  });

  it('parses tomorrow using calendar arithmetic', () => {
    expect(parseTelegramCapture('Renew certificate tomorrow', '2026-12-31').scheduledFor).toBe('2027-01-01');
  });

  it('parses an explicit local day', () => {
    expect(parseTelegramCapture('Call Alex 2026-08-02', '2026-07-18')).toMatchObject({ title: 'Call Alex', schedulePrecision: 'day', scheduledFor: '2026-08-02' });
  });

  it('moves an implicit past month into the next year', () => {
    expect(parseTelegramCapture('Review insurance in June', '2026-07-18')).toMatchObject({ title: 'Review insurance', schedulePrecision: 'month', scheduledFor: '2027-06' });
  });

  it('rejects a current explicit month and an empty title', () => {
    expect(() => parseTelegramCapture('Review insurance in July 2026', '2026-07-18')).toThrow(SchedulingError);
    expect(() => parseTelegramCapture('2026-08-02', '2026-07-18')).toThrow('actionable task title');
  });

  it('parses today', () => {
    expect(parseTelegramCapture('Buy paper today', '2026-08-30')).toMatchObject({ title: 'Buy paper', scheduledFor: '2026-08-30', defaultedToToday: false });
  });

  it('parses next Friday and Friday as next occurrence', () => {
    // 2026-08-30 is Sunday, next Friday is 2026-09-04
    expect(parseTelegramCapture('Order booth next Friday', '2026-08-30')).toMatchObject({ scheduledFor: '2026-09-04', defaultedToToday: false });
    expect(parseTelegramCapture('Order booth Friday', '2026-08-30')).toMatchObject({ scheduledFor: '2026-09-04', defaultedToToday: false });
    // If today is Friday, next Friday is +7
    expect(parseTelegramCapture('Task Friday', '2026-09-04')).toMatchObject({ scheduledFor: '2026-09-11' });
  });

  it('parses bare month and in month', () => {
    expect(parseTelegramCapture('Review September', '2026-08-30')).toMatchObject({ schedulePrecision: 'month', scheduledFor: '2026-09' });
    expect(parseTelegramCapture('Review in September', '2026-08-30')).toMatchObject({ schedulePrecision: 'month', scheduledFor: '2026-09' });
    expect(parseTelegramCapture('Review September 2027', '2026-08-30')).toMatchObject({ scheduledFor: '2027-09' });
  });

  it('parses time at end', () => {
    expect(parseTelegramCapture('Call Peter tomorrow 14:30', '2026-08-30')).toMatchObject({ scheduledFor: '2026-08-31', scheduledTime: '14:30' });
    expect(parseTelegramCapture('Call Peter tomorrow at 14:30', '2026-08-30')).toMatchObject({ scheduledTime: '14:30' });
    expect(parseTelegramCapture('Call Peter 2026-09-14 09:05', '2026-08-30')).toMatchObject({ scheduledFor: '2026-09-14', scheduledTime: '09:05' });
  });

  it('parses duration', () => {
    expect(parseTelegramCapture('Task 20m', '2026-08-30')).toMatchObject({ estimatedMinutes: 20 });
    expect(parseTelegramCapture('Task 20m', '2026-08-30').tags).toBeUndefined();
    expect(parseTelegramCapture('Task 45 min', '2026-08-30')).toMatchObject({ estimatedMinutes: 45 });
    expect(parseTelegramCapture('Task 2h', '2026-08-30')).toMatchObject({ estimatedMinutes: 120 });
    expect(parseTelegramCapture('Task 1h 30m', '2026-08-30')).toMatchObject({ estimatedMinutes: 90 });
    expect(parseTelegramCapture('Task 1h 30m', '2026-08-30').defaultedToToday).toBe(true); // duration alone still defaulted
  });

  it('parses tags', () => {
    expect(parseTelegramCapture('Task #sales', '2026-08-30')).toMatchObject({ tags: ['sales'] });
    expect(parseTelegramCapture('Task #movetrics #sales', '2026-08-30')).toMatchObject({ tags: ['movetrics', 'sales'] });
    expect(parseTelegramCapture('Task #Movetrics', '2026-08-30')).toMatchObject({ tags: ['Movetrics'] });
  });

  it('parses combined tomorrow time duration tags', () => {
    const p = parseTelegramCapture('Call Peter tomorrow 14:30 20m #sales', '2026-08-30');
    expect(p).toMatchObject({
      title: 'Call Peter',
      scheduledFor: '2026-08-31',
      scheduledTime: '14:30',
      estimatedMinutes: 20,
      tags: ['sales'],
      defaultedToToday: false,
    });
  });

  it('keeps duration/tags with unscheduled date as pending', () => {
    const p = parseTelegramCapture('Prepare email 45m #movetrics', '2026-08-30');
    expect(p.defaultedToToday).toBe(true);
    expect(p.estimatedMinutes).toBe(45);
    expect(p.tags).toEqual(['movetrics']);
  });

  it('rejects time on month precision', () => {
    expect(() => parseTelegramCapture('Review September 14:30', '2026-08-30')).toThrow(SchedulingError);
  });
});
