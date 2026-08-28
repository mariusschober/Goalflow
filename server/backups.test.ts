import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptServerBackup } from './backups';

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
});
