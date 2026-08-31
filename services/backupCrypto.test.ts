import { describe, expect, it } from 'vitest';
import { decryptBackup, encryptBackup } from './backupCrypto';
import type { GoalflowBackup } from './storage';

const backup: GoalflowBackup = {
  schemaVersion: 4,
  exportedAt: '2026-07-18T08:00:00.000Z',
  ownerKey: 'user-1',
  checksum: 'a'.repeat(64),
  collections: { tasks: [{ id: 'task-1', title: 'Ship Goalflow' }], habits: [] }
};

describe('encrypted backup files', () => {
  it('round-trips a typed backup without exposing plaintext', async () => {
    const encrypted = await encryptBackup(backup, 'correct horse battery staple');
    expect(encrypted.ciphertext).not.toContain('Ship Goalflow');
    await expect(decryptBackup(encrypted, 'correct horse battery staple')).resolves.toEqual(backup);
  });

  it('rejects short export passwords', async () => {
    await expect(encryptBackup(backup, 'too-short')).rejects.toThrow('at least 12');
  });

  it('rejects an incorrect password or modified ciphertext', async () => {
    const encrypted = await encryptBackup(backup, 'correct horse battery staple');
    await expect(decryptBackup(encrypted, 'different password')).rejects.toThrow('incorrect or the file is damaged');
    const modified = { ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -2)}AA` };
    await expect(decryptBackup(modified, 'correct horse battery staple')).rejects.toThrow('incorrect or the file is damaged');
  });
});
