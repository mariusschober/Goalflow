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

const userTables = ['profiles', 'tasks', 'daily_plans', 'task_events', 'telegram_identities', 'sync_records', 'entitlements'] as const;

const rotate = async (admin: SupabaseClient, userId: string, kind: 'daily' | 'weekly', keep: number) => {
  const { data, error } = await admin.from('backup_metadata').select('id,object_path')
    .eq('user_id', userId).eq('backup_kind', kind).eq('status', 'complete')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const expired = (data ?? []).slice(keep);
  if (!expired.length) return;
  const { error: removeError } = await admin.storage.from('goalflow-backups').remove(expired.map(item => item.object_path));
  if (removeError) throw removeError;
  await admin.from('backup_metadata').update({ status: 'deleted' }).in('id', expired.map(item => item.id));
};

export const runEncryptedBackups = async (config: AppConfig, admin: SupabaseClient): Promise<number> => {
  if (!config.BACKUP_MASTER_KEY) throw new Error('Encrypted backups are not configured.');
  const key = decodeKey(config.BACKUP_MASTER_KEY);
  const { data: profiles, error: profileError } = await admin.from('profiles').select('user_id').eq('status', 'active');
  if (profileError) throw profileError;
  let completed = 0;

  for (const profile of profiles ?? []) {
    const collections: Record<string, unknown> = {};
    for (const table of userTables) {
      const column = table === 'profiles' ? 'user_id' : 'user_id';
      const { data, error } = await admin.from(table).select('*').eq(column, profile.user_id);
      if (error) throw error;
      collections[table] = data ?? [];
    }
    const exportedAt = new Date().toISOString();
    const plain = Buffer.from(JSON.stringify({ schemaVersion: 2, exportedAt, userId: profile.user_id, collections }), 'utf8');
    const checksum = crypto.createHash('sha256').update(plain).digest('hex');
    const encrypted = encrypt(plain, key);
    const kind: 'daily' | 'weekly' = new Date().getUTCDay() === 0 ? 'weekly' : 'daily';
    const objectPath = `${profile.user_id}/${kind}/${exportedAt.replace(/[:.]/g, '-')}.goalflow-backup.enc`;
    const { error: uploadError } = await admin.storage.from('goalflow-backups').upload(objectPath, encrypted, {
      contentType: 'application/octet-stream', upsert: false, cacheControl: '0'
    });
    if (uploadError) throw uploadError;
    const { error: metadataError } = await admin.from('backup_metadata').insert({
      user_id: profile.user_id, object_path: objectPath, backup_kind: kind,
      checksum, byte_size: encrypted.length, status: 'complete'
    });
    if (metadataError) {
      await admin.storage.from('goalflow-backups').remove([objectPath]);
      throw metadataError;
    }
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
