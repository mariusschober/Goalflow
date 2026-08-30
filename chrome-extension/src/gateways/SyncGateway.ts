// Sync gateway — tranche 1: noop adapter. Final authoritative Sync (Sol) integrated in K last.
// Design preserves zero silent data loss: local mutations stay durable until final ack.

export interface SyncGateway {
  synchronize(): Promise<void>;
  readonly kind: string;
}

export class NoopSyncGateway implements SyncGateway {
  readonly kind = 'noop' as const;
  async synchronize(): Promise<void> {
    // Intentionally no-op in tranche 1. Logs once to aid debugging.
    // console.debug('[SyncGateway] noop synchronize — tranche 1 local only');
  }
}
