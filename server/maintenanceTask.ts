import type { SupabaseClient } from '@supabase/supabase-js';
import { runEncryptedBackups } from './backups';
import { productionConfigurationProblems, type AppConfig } from './config';

export class MaintenanceConfigurationError extends Error {
  constructor(readonly problems: string[]) {
    super('Maintenance configuration is invalid.');
    this.name = 'MaintenanceConfigurationError';
  }
}

type BackupRunner = (config: AppConfig, admin: SupabaseClient) => Promise<number>;

/**
 * Runs one complete maintenance attempt. The caller owns scheduling and must
 * treat a rejected promise as a failed invocation.
 */
export const runMaintenance = async (
  config: AppConfig,
  admin: SupabaseClient | undefined,
  backupRunner: BackupRunner = runEncryptedBackups
): Promise<{ backupUserCount: number }> => {
  const problems = productionConfigurationProblems(config);
  if (config.NODE_ENV !== 'production') problems.push('production_environment_required');
  if (config.BACKUPS_ENABLED !== 'true') problems.push('backups_not_enabled');
  if (!admin) problems.push('supabase_admin_client_unavailable');
  if (problems.length > 0) throw new MaintenanceConfigurationError([...new Set(problems)]);

  const backupUserCount = await backupRunner(config, admin!);
  return { backupUserCount };
};
