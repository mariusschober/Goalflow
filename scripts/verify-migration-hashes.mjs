import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const migrationsDir = path.resolve('supabase/migrations');
const manifestPath = path.join(migrationsDir, 'MIGRATION_SHA256_MANIFEST.json');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

let ok = true;
for (const file of Object.keys(manifest)) {
  const expected = manifest[file];
  const fullPath = path.join(migrationsDir, file);
  try {
    const content = readFileSync(fullPath);
    const hash = createHash('sha256').update(content).digest('hex');
    if (hash !== expected) {
      console.error(`MIGRATION_HASH_MISMATCH ${file}: expected ${expected} got ${hash}`);
      ok = false;
    } else {
      console.log(`MIGRATION_HASH_OK ${file} ${hash}`);
    }
  } catch (e) {
    console.error(`MIGRATION_MISSING ${file}: ${e.message}`);
    ok = false;
  }
}
// Ensure no migration file is present without being pinned (except manifest itself)
for (const file of files) {
  if (!(file in manifest)) {
    console.error(`MIGRATION_UNPINNED ${file}: file exists but not in MIGRATION_SHA256_MANIFEST.json — add or remove must be intentional forward-only migration`);
    // For now warning, not fail, because new forward migrations should be added to manifest
    // But strictly, pinned set must match filesystem.
    // We fail if extra file found that is not manifest-listed.
    ok = false;
  }
}
// Ensure manifest does not list non-existent files
for (const file of Object.keys(manifest)) {
  if (!files.includes(file)) {
    console.error(`MANIFEST_EXTRA ${file}: listed in manifest but file missing`);
    ok = false;
  }
}

if (!ok) {
  console.error('Migration hash verification FAILED — do not edit existing migration SQL files. Use forward-only migrations.');
  process.exit(1);
}
console.log(JSON.stringify({ status: 'PASS', checked: Object.keys(manifest).length }));
