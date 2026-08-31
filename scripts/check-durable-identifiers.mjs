import { readFileSync } from 'node:fs';

const checks = [
  { file: 'capacitor.config.ts', mustContain: "appId: 'com.mariusschober.goalflow'", label: 'Capacitor appId' },
  { file: 'android/app/build.gradle', mustContain: 'com.mariusschober.goalflow', label: 'Legacy Android appId' },
  { file: 'android-native/app/build.gradle', mustContain: 'com.mariusschober.goalflow.nativeapp', label: 'Native namespace' },
  { file: 'android-native/app/build.gradle', mustContain: 'applicationId "com.mariusschober.goalflow"', label: 'Native applicationId' },
  { file: 'services/storage.ts', mustContain: "BASE_DB_NAME = 'GoalflowDB'", label: 'Web DB name' },
  { file: 'android-native/app/src/main/java/com/mariusschober/goalflow/nativeapp/data/GoalflowDatabase.kt', mustContain: '"goalflow-native.db"', label: 'Native DB name' },
  { file: 'server/backups.ts', mustContain: "Buffer.from('GFB1')", label: 'Backup format GFB1' },
  { file: 'vite.config.ts', mustContain: "name: 'Goalflow'", label: 'PWA manifest name' },
];

const forbidRenames = [
  { file: 'supabase/migrations', note: 'Migration filenames must remain stable — only forward-only new migrations allowed' },
  { file: 'android-native/app/schemas', note: 'Room schemas 1..8 must not be removed or modified' },
];

let ok = true;
for (const { file, mustContain, label } of checks) {
  try {
    const content = readFileSync(file, 'utf8');
    if (!content.includes(mustContain)) {
      console.error(`IDENTIFIER_MISMATCH ${label} in ${file}: expected to contain "${mustContain}"`);
      ok = false;
    } else {
      console.log(`IDENTIFIER_OK ${label}`);
    }
  } catch (e) {
    console.error(`IDENTIFIER_MISSING_FILE ${file}: ${e.message}`);
    ok = false;
  }
}

// Check storage keys still prefixed with goalflow
try {
  const storage = readFileSync('services/storage.ts', 'utf8');
  if (!storage.includes('goalflow')) {
    console.error('IDENTIFIER_MISMATCH storage keys missing goalflow prefix');
    ok = false;
  } else console.log('IDENTIFIER_OK storage keys contain goalflow');
} catch (e) {
  console.error(e.message);
  ok = false;
}

// Check URL scheme
try {
  const manifest = readFileSync('android-native/app/src/main/AndroidManifest.xml', 'utf8');
  if (!manifest.includes('com.mariusschober.goalflow') && !manifest.includes('goalflow')) {
    console.error('IDENTIFIER_MISMATCH URL scheme/manifest missing goalflow');
    ok = false;
  } else console.log('IDENTIFIER_OK manifest contains goalflow');
} catch (_) {}

if (!ok) {
  console.error('Durable identifier check FAILED — do not rename database names, bundle IDs, schemes, backup formats, or migration filenames/schemas.');
  process.exit(1);
}
console.log(JSON.stringify({ status: 'PASS', checked: checks.length }));
