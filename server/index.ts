import { createApp } from "./app";
import { readConfig } from "./config";
import { createAdminClient } from './supabase';
import { startBackupScheduler } from './backups';

const config = readConfig();
const app = await createApp(config);
const stopBackups = startBackupScheduler(config, createAdminClient(config));
const server = app.listen(config.PORT, config.HOST, () => {
  console.log(JSON.stringify({ level: "info", event: "server.started", host: config.HOST, port: config.PORT, environment: config.NODE_ENV }));
});

const shutdown = (signal: string) => {
  stopBackups();
  console.log(JSON.stringify({ level: "info", event: "server.stopping", signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
