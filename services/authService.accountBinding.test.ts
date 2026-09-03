import type { Session } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { assertSessionMatchesUser, SessionAccountMismatchError } from './authService';

const session = (userId: string) => ({ user: { id: userId } }) as Session;

describe('authenticated account binding', () => {
  it('allows the immutable account that owns the local database', () => {
    expect(() => assertSessionMatchesUser(session('user-a'), 'user-a')).not.toThrow();
  });

  it('stops before a retained outbox can be sent with another account token', () => {
    expect(() => assertSessionMatchesUser(session('user-b'), 'user-a'))
      .toThrow(SessionAccountMismatchError);
  });
});
