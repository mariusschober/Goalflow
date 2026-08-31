import type { AppConfig } from "./config";

const priorities = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type LogLevel = keyof typeof priorities;
export const createLogger = (config: AppConfig) => {
  const write = (level: LogLevel, event: string, details: Record<string, unknown> = {}) => {
    if (priorities[level] < priorities[config.LOG_LEVEL]) return;
    const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...details });
    if (level === "error") console.error(entry);
    else if (level === "warn") console.warn(entry);
    else console.log(entry);
  };
  return {
    debug: (event: string, details?: Record<string, unknown>) => write("debug", event, details),
    info: (event: string, details?: Record<string, unknown>) => write("info", event, details),
    warn: (event: string, details?: Record<string, unknown>) => write("warn", event, details),
    error: (event: string, details?: Record<string, unknown>) => write("error", event, details)
  };
};
export type Logger = ReturnType<typeof createLogger>;
