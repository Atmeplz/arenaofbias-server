import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { switchCurrent } from '../scripts/datapack-switch.mjs';
import { symlinkSync } from 'node:fs';

test('failed Windows junction switch restores the previous current link', () => {
  const root = mkdtempSync(join(tmpdir(), 'datapack-switch-'));
  const old = join(root, 'old');
  const next = join(root, 'next');
  const current = join(root, 'current');
  try {
    mkdirSync(old);
    mkdirSync(next);
    symlinkSync(old, current, 'junction');
    assert.throws(() => switchCurrent(current, next, { windows: true, rename: () => { throw new Error('injected EACCES'); } }),
      /injected EACCES; previous link was restored/);
    assert.equal(realpathSync(current), realpathSync(old));
    assert.equal(existsSync(next), true);
    assert.equal(existsSync(`${current}.next-${process.pid}`), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
