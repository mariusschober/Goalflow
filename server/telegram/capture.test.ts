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
});
