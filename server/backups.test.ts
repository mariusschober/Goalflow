import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from './config';
import { createEncryptedBackupForUser, decryptServerBackup } from './backups';

const key = crypto.randomBytes(32);

const envelope = (payload: unknown): { encrypted: Buffer; checksum: string } => {
  const plain = Buffer.from(JSON.stringify(payload), 'utf8');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const encrypted = Buffer.concat([Buffer.from('GFB1'), iv, cipher.getAuthTag(), ciphertext]);
  return { encrypted, checksum: crypto.createHash('sha256').update(plain).digest('hex') };
};

describe('server backup restore boundary', () => {
  it('decrypts only an authenticated backup with the expected owner payload', () => {
    const payload = {
      schemaVersion: 3,
      exportedAt: '2026-08-27T00:00:00Z',
      userId: '00000000-0000-4000-8000-000000000001',
      collections: { tasks: [], sync_mutations: [], sync_conflicts: [] }
    };
    const backup = envelope(payload);
    expect(decryptServerBackup(backup.encrypted, key.toString('hex'), backup.checksum)).toEqual(payload);
  });

  it('rejects modified ciphertext and checksum before returning collections', () => {
    const backup = envelope({
      schemaVersion: 3,
      exportedAt: '2026-08-27T00:00:00Z',
      userId: '00000000-0000-4000-8000-000000000001',
      collections: { tasks: [{ id: 'valuable' }] }
    });
    const modified = Buffer.from(backup.encrypted);
    modified[modified.length - 1] ^= 1;
    expect(() => decryptServerBackup(modified, key.toString('hex'), backup.checksum)).toThrow();
    expect(() => decryptServerBackup(backup.encrypted, key.toString('hex'), '0'.repeat(64))).toThrow('checksum');
  });

  it('rejects an invalid owner or export timestamp before restore data is exposed', () => {
    const invalidOwner = envelope({
      schemaVersion: 3,
      exportedAt: '2026-08-27T00:00:00Z',
      userId: 'not-an-account',
      collections: { tasks: [{ id: 'valuable' }] }
    });
    const invalidTimestamp = envelope({
      schemaVersion: 3,
      exportedAt: 'not-a-timestamp',
      userId: '00000000-0000-4000-8000-000000000001',
      collections: { tasks: [{ id: 'valuable' }] }
    });

    expect(() => decryptServerBackup(invalidOwner.encrypted, key.toString('hex'), invalidOwner.checksum))
      .toThrow('plaintext');
    expect(() => decryptServerBackup(invalidTimestamp.encrypted, key.toString('hex'), invalidTimestamp.checksum))
      .toThrow('plaintext');
  });

  it('marks metadata incomplete before upload and complete only after the object is durable', async () => {
    const events: string[] = [];
    let uploaded: Buffer | undefined;
    let inserted: Record<string, unknown> | undefined;
    const updateBuilder = {
      eq() { return this; },
      select() { return this; },
      async single() {
        events.push('metadata-complete');
        return { data: { object_path: inserted?.object_path }, error: null };
      }
    };
    const admin = {
      async rpc(name: string) {
        if (name === 'goalflow_sync_protocol_version') return { data: 3, error: null };
        if (name === 'export_goalflow_backup') return { data: { tasks: [{ id: 'valuable' }] }, error: null };
        return { data: null, error: new Error('unexpected RPC') };
      },
      from(table: string) {
        expect(table).toBe('backup_metadata');
        return {
          async insert(row: Record<string, unknown>) {
            inserted = row;
            events.push(`metadata-${row.status}`);
            return { error: null };
          },
          update() { return updateBuilder; }
        };
      },
      storage: {
        from(bucket: string) {
          expect(bucket).toBe('goalflow-backups');
          return {
            async upload(_path: string, bytes: Buffer) {
              events.push('object-upload');
              uploaded = bytes;
              return { error: null };
            }
          };
        }
      }
    } as unknown as SupabaseClient;
    const config = { BACKUP_MASTER_KEY: key.toString('hex') } as AppConfig;

    const created = await createEncryptedBackupForUser(
      config,
      admin,
      '00000000-0000-4000-8000-000000000001',
      { metadataKind: 'daily', pathKind: 'pre-restore' }
    );

    expect(events).toEqual(['metadata-failed', 'object-upload', 'metadata-complete']);
    expect(inserted).toMatchObject({ status: 'failed', checksum: created.checksum });
    expect(created.objectPath).toContain('/pre-restore/');
    expect(decryptServerBackup(uploaded!, key.toString('hex'), created.checksum).collections)
      .toEqual({ tasks: [{ id: 'valuable' }] });
  });

  it('leaves visible failed metadata when object upload fails', async () => {
    const statuses: unknown[] = [];
    const admin = {
      async rpc(name: string) {
        return name === 'goalflow_sync_protocol_version'
          ? { data: 3, error: null }
          : { data: { tasks: [] }, error: null };
      },
      from() {
        return {
          async insert(row: Record<string, unknown>) {
            statuses.push(row.status);
            return { error: null };
          }
        };
      },
      storage: { from: () => ({ upload: async () => ({ error: new Error('storage unavailable') }) }) }
    } as unknown as SupabaseClient;

    await expect(createEncryptedBackupForUser(
      { BACKUP_MASTER_KEY: key.toString('hex') } as AppConfig,
      admin,
      '00000000-0000-4000-8000-000000000001'
    )).rejects.toThrow('storage unavailable');
    expect(statuses).toEqual(['failed']);
  });
});
