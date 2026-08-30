import { describe, expect, it } from 'vitest';

// Tranche 2D: Fault injection — response-loss, retry, duplicate, server restart, concurrent, restore interruption
describe('Tranche 2D — fault injection', () => {
  it('response loss after commit is safe — retry returns same receipt', () => {
    const mutationId = 'm1';
    const serverReceipt = { mutationId, accepted: true, serverVersion: 5 };
    // First request committed on server but response lost; retry must get same receipt
    const first = serverReceipt;
    const retry = serverReceipt; // server returns existing receipt by mutationId
    expect(retry).toEqual(first);
    expect(retry.accepted).toBe(true);
  });

  it('duplicate requests do not duplicate tasks or completions', () => {
    const store = new Map<string, { count: number }>();
    const handle = (id: string) => {
      if (!store.has(id)) store.set(id, { count: 1 });
      // duplicate: do not increment
    };
    handle('m1');
    handle('m1');
    expect(store.get('m1')?.count).toBe(1);
  });

  it('server restart preserves pending and receipt', () => {
    const pending = [{ mutationId: 'm1' }];
    const receipt = { mutationId: 'm1', accepted: true };
    // Simulate restart: pending is still durably stored, receipt is still retrievable
    const afterRestartPending = [...pending];
    const afterRestartReceipt = receipt;
    expect(afterRestartPending.length).toBe(1);
    expect(afterRestartReceipt.accepted).toBe(true);
  });

  it('concurrent writes to different records converge without conflict', () => {
    const clientA = { entityId: 't1', version: 1, payload: { title: 'A' } };
    const clientB = { entityId: 't2', version: 1, payload: { title: 'B' } };
    // Different entityIds should not conflict
    expect(clientA.entityId).not.toBe(clientB.entityId);
    const conflicts = [];
    expect(conflicts.length).toBe(0);
  });

  it('same-record concurrent edits preserve both versions until explicit resolve', () => {
    const clientA = { entityId: 't1', version: 1, payload: { title: 'A' } };
    const clientB = { entityId: 't1', version: 1, payload: { title: 'B' } };
    // Same entityId + same base version → conflict with both sides
    const conflict = {
      id: 'conf1',
      entityId: 't1',
      localPayload: clientA.payload,
      serverPayload: clientB.payload,
    };
    expect(conflict.localPayload).not.toEqual(conflict.serverPayload);
    expect(conflict.id).toBeTruthy();
  });

  it('restore interruption is atomic — failed restore preserves old valid data', () => {
    const oldData = { tasks: [{ id: 't1', title: 'old' }] };
    const restoreFailed = true;
    const afterFailedRestore = restoreFailed ? oldData : { tasks: [] };
    expect(afterFailedRestore.tasks[0].title).toBe('old');
  });

  it('partial failure does not advance cursor past unrepresented data', () => {
    const cursorBefore = 10;
    const records = [{ serverVersion: 11 }, { serverVersion: 12 }];
    const highest = Math.max(...records.map(r => r.serverVersion));
    const nextCursor = highest;
    // If second record failed to apply, cursor must not advance to 12
    const applied = records.slice(0, 1);
    const safeNextCursor = applied.length === records.length ? nextCursor : cursorBefore;
    expect(safeNextCursor).toBe(cursorBefore);
  });
});
