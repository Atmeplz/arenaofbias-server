import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const slash = (path) => path.replaceAll('\\', '/');
const run = (script, bin, env) => {
  const path = process.platform === 'win32' ? 'export PATH="$(cygpath -u "$1"):$PATH"; bash "$2"'
    : 'export PATH="$1:$PATH"; bash "$2"';
  return spawnSync(bash, ['-c', path, '_', slash(bin), slash(resolve(script))], { encoding: 'utf8', env: { ...process.env, ...env } });
};

test('failed sync keeps its pin and retries; successful sync writes it last', () => {
  const root = mkdtempSync(join(tmpdir(), 'sync-round2-'));
  const server = join(root, 'server');
  const repo = join(root, 'repo');
  const bin = join(root, 'bin');
  const old = 'a'.repeat(40), next = 'b'.repeat(40);
  try {
    for (const path of [server, repo, bin]) mkdirSync(path);
    const pin = join(server, 'datapack.json');
    writeFileSync(pin, JSON.stringify({ repo: 'owner/data', branch: 'datapack', commit: old }));
    writeFileSync(join(bin, 'git'), `#!/bin/sh\ncase "$1" in fetch) exit 0;; rev-parse) echo ${next};; *) exit 99;; esac\n`);
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nif [ "$FAIL_FETCH" = 1 ]; then exit 7; fi\nexit 0\n');
    chmodSync(join(bin, 'git'), 0o755);
    chmodSync(join(bin, 'npm'), 0o755);
    const env = { DATAPACK_SERVER_ROOT: slash(server), DATAPACK_REPO_DIR: slash(repo) };
    const script = 'scripts/datapack-sync.sh';
    const failed = run(script, bin, { ...env, FAIL_FETCH: '1' });
    assert.equal(failed.status, 7, failed.stderr);
    assert.equal(JSON.parse(readFileSync(pin)).commit, old);
    const retry = run(script, bin, env);
    assert.equal(retry.status, 0, retry.stderr);
    assert.equal(JSON.parse(readFileSync(pin)).commit, next);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('failed backup generation preserves the previous staging snapshot', () => {
  const root = mkdtempSync(join(tmpdir(), 'backup-round2-'));
  const repo = join(root, 'repo');
  const data = join(root, 'data');
  const staging = join(root, 'staging');
  const bin = join(root, 'bin');
  try {
    for (const path of [repo, data, staging, bin]) mkdirSync(path);
    const snapshot = join(staging, 'platform.db');
    writeFileSync(snapshot, 'previous-snapshot');
    writeFileSync(join(bin, 'git'), '#!/bin/sh\nexit 1\n');
    chmodSync(join(bin, 'git'), 0o755);
    const result = run('scripts/archive-backup.sh', bin, { ARCHIVE_REPO_DIR: slash(repo),
      ARCHIVE_DATA_DIR: slash(data), ARCHIVE_STAGING_DIR: slash(staging), ARCHIVE_DIST_DIR: slash(join(root, 'missing')) });
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(snapshot, 'utf8'), 'previous-snapshot');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
