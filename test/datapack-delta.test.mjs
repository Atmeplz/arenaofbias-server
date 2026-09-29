import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const run = (...args) => spawnSync(process.execPath, [new URL('../scripts/datapack-delta.mjs', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, ''), ...args], { encoding: 'utf8' });

test('datapack delta applies additions, changes and removals; tampering blocks verification', () => {
  const root = mkdtempSync(join(tmpdir(), 'datapack-delta-'));
  const oldPack = join(root, 'old'), newPack = join(root, 'new'), rebuilt = join(root, 'rebuilt');
  const delta = join(root, 'delta.gz');
  try {
    mkdirSync(join(oldPack, 'results'), { recursive: true });
    mkdirSync(join(newPack, 'results'), { recursive: true });
    writeFileSync(join(oldPack, 'results', 'keep.txt'), 'same');
    writeFileSync(join(oldPack, 'results', 'change.txt'), 'before');
    writeFileSync(join(oldPack, 'results', 'remove.txt'), 'gone');
    writeFileSync(join(newPack, 'results', 'keep.txt'), 'same');
    writeFileSync(join(newPack, 'results', 'change.txt'), 'after');
    writeFileSync(join(newPack, 'results', 'add.txt'), 'new');
    const created = run('create', oldPack, newPack, delta);
    assert.equal(created.status, 0, created.stderr);
    const summary = JSON.parse(created.stdout);
    assert.equal(summary.changed, 2);
    assert.equal(summary.removed, 1);
    assert.equal(run('apply', oldPack, delta, rebuilt).status, 0);
    assert.equal(run('verify', rebuilt, delta).stdout.trim(), summary.target);
    assert.equal(readFileSync(join(rebuilt, 'results', 'add.txt'), 'utf8'), 'new');
    writeFileSync(join(rebuilt, 'results', 'keep.txt'), 'tampered');
    const rejected = run('verify', rebuilt, delta);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /checksum mismatch/);
    assert.notEqual(run('apply', rebuilt, delta, join(root, 'rejected')).status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
