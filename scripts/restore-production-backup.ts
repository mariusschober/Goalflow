import { readConfig } from '../server/config';
import { createAdminClient } from '../server/supabase';
import { createEncryptedBackupForUser, decryptServerBackup } from '../server/backups';

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const userId = argument('--user');
const objectPath = argument('--object');
const confirmedUser = argument('--confirm-user');

if (!userId || !objectPath || confirmedUser !== userId) {
  throw new Error(
    'Usage: npm run restore:backup -- --user <uuid> --object <path> --confirm-user <same uuid>'
  );
}

const config = readConfig({ ...process.env, NODE_ENV: 'production' });
if (!config.BACKUP_MASTER_KEY) throw new Error('BACKUP_MASTER_KEY is not configured.');
const admin = createAdminClient(config);
if (!admin) throw new Error('Supabase service-role access is not configured.');

const { data: metadata, error: metadataError } = await admin.from('backup_metadata')
  .select('object_path,checksum,status')
  .eq('user_id', userId)
  .eq('object_path', objectPath)
  .eq('status', 'complete')
  .single();
if (metadataError || !metadata) throw metadataError ?? new Error('Completed backup metadata was not found.');

const { data: object, error: downloadError } = await admin.storage.from('goalflow-backups').download(objectPath);
if (downloadError || !object) throw downloadError ?? new Error('Encrypted backup object was not found.');
const backup = decryptServerBackup(
  Buffer.from(await object.arrayBuffer()),
  config.BACKUP_MASTER_KEY,
  String(metadata.checksum)
);
if (backup.userId !== userId) throw new Error('Backup owner does not match the explicit restore target.');

// A successful but operator-mistaken point-in-time restore still needs a
// recovery path. Abort before touching the database unless the current state
// has itself been encrypted, uploaded, and marked complete.
const preRestoreBackup = await createEncryptedBackupForUser(config, admin, userId, {
  metadataKind: 'daily',
  pathKind: 'pre-restore'
});

const { data: result, error: restoreError } = await admin.rpc('restore_goalflow_backup', {
  target_user_id: userId,
  backup_payload: backup
});
if (restoreError) throw restoreError;
process.stdout.write(`${JSON.stringify({ result, preRestoreBackup })}\n`);
