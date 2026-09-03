import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const roots = [path.resolve('dist/client'), path.resolve('dist/mini')];
const forbiddenNames = [
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'BACKUP_MASTER_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY',
  'TURNSTILE_SECRET_KEY'
];
const forbiddenValues = forbiddenNames.map(name => process.env[name]).filter(value => value && value.length > 8);

const files = [];
const visit = async directory => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(fullPath);
    else files.push(fullPath);
  }
};

for (const root of roots) await visit(root);
const findings = [];
for (const file of files) {
  const content = await readFile(file, 'utf8');
  for (const name of forbiddenNames) if (content.includes(name)) findings.push(`${file}: ${name}`);
  for (const value of forbiddenValues) if (content.includes(value)) findings.push(`${file}: configured secret value`);
  if (/sb_secret_[A-Za-z0-9_-]{16,}/.test(content)) findings.push(`${file}: Supabase secret-key-shaped value`);
}
if (findings.length) {
  console.error('Forbidden server secret material found in the client bundle:');
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Client secret scan passed across ${files.length} built files.`);
}
