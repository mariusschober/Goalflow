import { readConfig } from './config';
import { MaintenanceConfigurationError, runMaintenance } from './maintenanceTask';
import { createAdminClient } from './supabase';

try {
  const config = readConfig();
  const result = await runMaintenance(config, createAdminClient(config));
  console.log(JSON.stringify({
    level: 'info',
    event: 'maintenance.completed',
    backupUserCount: result.backupUserCount
  }));
} catch (error) {
  console.error(JSON.stringify({
    level: 'error',
    event: 'maintenance.failed',
    category: error instanceof Error ? error.name : 'unknown',
    ...(error instanceof MaintenanceConfigurationError ? { problems: error.problems } : {})
  }));
  process.exitCode = 1;
}
