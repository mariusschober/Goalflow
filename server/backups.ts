import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from './config';

const decodeKey = (value: string): Buffer => {
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('BACKUP_MASTER_KEY must decode to exactly 32 bytes.');
  return key;
};

const encrypt = (payload: Buffer, key: Buffer): Buffer => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from('GFB1'), iv, tag, ciphertext]);
};

export interface DecryptedServerBackup {
  schemaVersion: number;
  exportedAt: string;
  userId: string;
  collections: Record<string, unknown>;
}

/** Verifies the encrypted envelope and plaintext checksum before any restore RPC can run. */
export const decryptServerBackup = (
  encrypted: Buffer,
  masterKey: string,
  expectedChecksum?: string
): DecryptedServerBackup => {
  if (encrypted.length < 48 || encrypted.subarray(0, 4).toString('ascii') !== 'GFB1') {
    throw new Error('Backup envelope is invalid.');
  }
  const key = decodeKey(masterKey);
  const iv = encrypted.subarray(4, 16);
  const tag = encrypted.subarray(16, 32);
  const ciphertext = encrypted.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const checksum = crypto.createHash('sha256').update(plain).digest('hex');
  if (expectedChecksum) {
    if (!/^[a-f0-9]{64}$/i.test(expectedChecksum)
      || !crypto.timingSafeEqual(Buffer.from(checksum), Buffer.from(expectedChecksum.toLowerCase()))) {
      throw new Error('Backup checksum validation failed.');
    }
  }
  const parsed = JSON.parse(plain.toString('utf8')) as Partial<DecryptedServerBackup>;
  if (!Number.isInteger(parsed.schemaVersion) || Number(parsed.schemaVersion) < 1 || Number(parsed.schemaVersion) > 3) {
    throw new Error('Backup schema version is unsupported.');
  }
  if (typeof parsed.exportedAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(parsed.exportedAt)
    || !Number.isFinite(Date.parse(parsed.exportedAt))
    || typeof parsed.userId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.userId)
    || !parsed.collections
    || typeof parsed.collections !== 'object' || Array.isArray(parsed.collections)) {
    throw new Error('Backup plaintext is invalid.');
  }
  return parsed as DecryptedServerBackup;
};

const rotate = async (admin: SupabaseClient, userId: string, kind: 'daily' | 'weekly', keep: number) => {
  const { data, error } = await admin.from('backup_metadata').select('id,object_path')
    .eq('user_id', userId).eq('backup_kind', kind).eq('status', 'complete')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const expired = (data ?? []).slice(keep);
  if (!expired.length) return;
  const { error: metadataError } = await admin.from('backup_metadata').update({ status: 'deleted' })
    .eq('user_id', userId).in('id', expired.map(item => item.id));
  if (metadataError) throw metadataError;
  const { error: removeError } = await admin.storage.from('goalflow-backups').remove(expired.map(item => item.object_path));
  if (removeError) {
    // The encrypted objects still exist. Restore their discoverability before
    // surfacing the failure; retention must never turn a transient storage
    // error into an apparently deleted, valid backup.
    const { error: rollbackError } = await admin.from('backup_metadata').update({ status: 'complete' })
      .eq('user_id', userId).in('id', expired.map(item => item.id));
    if (rollbackError) {
      throw new AggregateError([removeError, rollbackError], 'Backup rotation failed and metadata recovery also failed.');
    }
    throw removeError;
  }
};

export interface CreatedEncryptedBackup {
  userId: string;
  objectPath: string;
  checksum: string;
  byteSize: number;
  exportedAt: string;
}

const requireBackupProtocol = async (admin: SupabaseClient): Promise<void> => {
  const { data: protocolVersion, error: protocolError } = await admin.rpc('goalflow_sync_protocol_version');
  if (protocolError || Number(protocolVersion) !== 3) {
    throw new Error('Backups were not started because the complete data-integrity schema is not installed.');
  }
};

/**
 * Creates one encrypted, checksummed user backup. Metadata is inserted in a
 * visible failed state before the object upload; a crash can therefore leave
 * an incomplete backup, but never an undiscoverable object presented as valid.
 */
export const createEncryptedBackupForUser = async (
  config: AppConfig,
  admin: SupabaseClient,
  userId: string,
  options: {
    metadataKind?: 'daily' | 'weekly';
    pathKind?: 'daily' | 'weekly' | 'pre-restore';
    protocolAlreadyVerified?: boolean;
  } = {}
): Promise<CreatedEncryptedBackup> => {
  if (!config.BACKUP_MASTER_KEY) throw new Error('Encrypted backups are not configured.');
  if (!options.protocolAlreadyVerified) await requireBackupProtocol(admin);
  const key = decodeKey(config.BACKUP_MASTER_KEY);
  const { data: collections, error: exportError } = await admin.rpc('export_goalflow_backup', {
    target_user_id: userId
  });
  if (exportError) throw exportError;
  if (!collections || typeof collections !== 'object' || Array.isArray(collections)) {
    throw new Error('Database backup export returned an invalid snapshot.');
  }
  const exportedAt = new Date().toISOString();
  const plain = Buffer.from(JSON.stringify({ schemaVersion: 3, exportedAt, userId, collections }), 'utf8');
  const checksum = crypto.createHash('sha256').update(plain).digest('hex');
  const encrypted = encrypt(plain, key);
  const metadataKind = options.metadataKind ?? (new Date().getUTCDay() === 0 ? 'weekly' : 'daily');
  const pathKind = options.pathKind ?? metadataKind;
  const objectPath = `${userId}/${pathKind}/${exportedAt.replace(/[:.]/g, '-')}.goalflow-backup.enc`;

  const { error: metadataError } = await admin.from('backup_metadata').insert({
    user_id: userId,
    object_path: objectPath,
    backup_kind: metadataKind,
    checksum,
    byte_size: encrypted.length,
    status: 'failed'
  });
  if (metadataError) throw metadataError;

  const { error: uploadError } = await admin.storage.from('goalflow-backups').upload(objectPath, encrypted, {
    contentType: 'application/octet-stream', upsert: false, cacheControl: '0'
  });
  if (uploadError) throw uploadError;

  const { data: completedMetadata, error: completeError } = await admin.from('backup_metadata')
    .update({ status: 'complete' })
    .eq('user_id', userId).eq('object_path', objectPath).eq('status', 'failed')
    .select('object_path').single();
  if (completeError || !completedMetadata) {
    throw completeError ?? new Error('Backup upload completed but durable metadata was not finalized.');
  }
  return { userId, objectPath, checksum, byteSize: encrypted.length, exportedAt };
};

export const runEncryptedBackups = async (config: AppConfig, admin: SupabaseClient): Promise<number> => {
  if (!config.BACKUP_MASTER_KEY) throw new Error('Encrypted backups are not configured.');
  await requireBackupProtocol(admin);
  const { data: profiles, error: profileError } = await admin.from('profiles').select('user_id').eq('status', 'active');
  if (profileError) throw profileError;
  let completed = 0;

  for (const profile of profiles ?? []) {
    const kind: 'daily' | 'weekly' = new Date().getUTCDay() === 0 ? 'weekly' : 'daily';
    await createEncryptedBackupForUser(config, admin, String(profile.user_id), {
      metadataKind: kind,
      pathKind: kind,
      protocolAlreadyVerified: true
    });
    await rotate(admin, profile.user_id, 'daily', 7);
    await rotate(admin, profile.user_id, 'weekly', 4);
    completed += 1;
  }
  return completed;
};

export const startBackupScheduler = (config: AppConfig, admin?: SupabaseClient): (() => void) => {
  if (!admin || !config.BACKUP_MASTER_KEY) return () => undefined;
  let lastRun = '';
  let running = false;
  const tick = async () => {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    if (running || lastRun === day || now.getUTCHours() !== config.BACKUP_HOUR_UTC) return;
    running = true;
    try {
      const count = await runEncryptedBackups(config, admin);
      lastRun = day;
      console.log(JSON.stringify({ level: 'info', event: 'backup.completed', userCount: count }));
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'backup.failed', category: error instanceof Error ? error.name : 'unknown' }));
    } finally { running = false; }
  };
  const interval = setInterval(() => void tick(), 15 * 60_000);
  void tick();
  return () => clearInterval(interval);
};
