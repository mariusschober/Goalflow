import { describe, expect, it } from 'vitest';
import { assertDurableReceipt } from './sync';

const mutation = {
  mutationId: '11111111-1111-4111-8111-111111111111',
  deviceId: 'device-a',
  entityType: 'tasks' as const,
  entityId: 'task-1',
  baseServerVersion: null,
  version: 1,
  payload: { id: 'task-1', title: 'valuable' },
  updatedAt: '2026-08-27T00:00:00.000Z',
  deletedAt: null
};

const receipt = () => ({
  accepted: true,
  serverVersion: 7,
  record: {
    entity_type: mutation.entityType,
    entity_id: mutation.entityId,
    version: mutation.version,
    server_version: 7,
    payload: mutation.payload,
    updated_at: mutation.updatedAt,
    deleted_at: mutation.deletedAt
  }
});

describe('sync API durable acceptance boundary', () => {
  it('accepts only a receipt proving the exact committed record', () => {
    expect(assertDurableReceipt(mutation, receipt())).toMatchObject({ accepted: true, serverVersion: 7 });
  });

  it.each([
    ['entity identity', { entity_id: 'task-2' }],
    ['local version', { version: 2 }],
    ['server version', { server_version: 8 }],
    ['payload', { payload: { id: 'task-1', title: 'wrong' } }],
    ['update timestamp', { updated_at: '2026-08-27T00:00:01.000Z' }],
    ['tombstone timestamp', { deleted_at: '2026-08-27T00:00:01.000Z' }]
  ])('rejects an accepted RPC result with the wrong %s', (_label, recordPatch) => {
    const value = receipt();
    value.record = { ...value.record, ...recordPatch };
    expect(() => assertDurableReceipt(mutation, value)).toThrow(/exact durable server record/i);
  });

  it('rejects ambiguous acceptance flags even with a matching record', () => {
    expect(() => assertDurableReceipt(mutation, { ...receipt(), replayMismatch: true }))
      .toThrow(/exact durable server record/i);
  });
});
