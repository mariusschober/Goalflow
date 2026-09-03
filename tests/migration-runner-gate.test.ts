import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('PostgreSQL migration runner gate', () => {
  it('uses the version-checked runner database without a Docker Hub pull', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
    expect(workflow).not.toContain('image: postgres:16');
    expect(workflow).toContain('installed_major="$(psql --version');
    expect(workflow).toContain('[ "$installed_major" = "16" ]');
    expect(workflow).toContain('sudo systemctl start postgresql.service');
    expect(workflow).toContain('env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD');
    expect(workflow).toContain('pg_isready --host="$PGHOST"');
  });
});
