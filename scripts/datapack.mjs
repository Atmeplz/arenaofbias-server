// Install immutable releases, switch the current symlink, or inspect expiry-based cleanup.
import { existsSync, readFileSync, readdirSync, realpathSync, lstatSync, mkdirSync, symlinkSync, renameSync, rmSync, rmdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { fetchDatapack, readSource, validatePackage } from './datapack-client.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pin = JSON.parse(readFileSync(join(root, 'datapack.json'), 'utf8'));
const versions = resolve(process.env.DATAPACK_VERSIONS_DIR || join(root, '.datapack/versions'));
const current = resolve(process.env.DIST_DIR || join(root, '.datapack/current'));
const args = process.argv.slice(2), command = args[0] || 'fetch';
const target = join(versions, pin.commit);
if (command === 'fetch') {
  await fetchDatapack({ pin, target, immutable: true });
  console.log(`Installed ${pin.commit}. Run npm run activate:datapack with DIST_DIR=${current}`);
} else if (command === 'activate') {
  validatePackage(target);
  if (readSource(target)?.commit !== pin.commit) throw new Error('Installed release does not match pin');
  if (existsSync(current) && realpathSync(current) === realpathSync(target)) {
    console.log(`Already current: ${pin.commit}`);
    process.exit(0);
  }
  mkdirSync(dirname(current), { recursive: true });
  if (existsSync(current) && !lstatSync(current).isSymbolicLink()) throw new Error('DIST_DIR must be a symlink; existing directories are never replaced');
  const pending = `${current}.next-${process.pid}`;
  symlinkSync(target, pending, process.platform === 'win32' ? 'junction' : 'dir');
  // Windows 上 rename 无法覆盖既有 junction，且 rmSync 会把 junction 当目录报 EISDIR；
  // junction 要用 rmdir 摘除（只删链接、不动目标）。代价：Windows 上切换非原子。
  const unlinkLink = (path) => (process.platform === 'win32' ? rmdirSync(path) : rmSync(path));
  try {
    if (process.platform === 'win32' && existsSync(current)) rmdirSync(current);
    renameSync(pending, current);
  }
  catch (error) {
    unlinkLink(pending);
    throw new Error(`Cannot atomically switch DIST_DIR on this filesystem; current release was kept. Use a supported symlink deployment or stop the service before a manual switch. ${error.message}`);
  }
  console.log(`Current release: ${pin.commit}`);
} else if (command === 'prune') {
  const grace = Number(process.env.DATAPACK_CLEANUP_GRACE_MS || 3600000);
  if (!Number.isFinite(grace) || grace < 0) throw new Error('Invalid cleanup grace period');
  const database = join(resolve(process.env.DATA_DIR || join(root, '.data')), 'platform.db');
  if (!existsSync(database)) throw new Error('No platform database: cannot prove which releases are in use');
  if (!existsSync(current)) throw new Error('Current release is missing; cleanup refused');
  const db = new DatabaseSync(database, { readOnly: true });
  const keep = new Set([realpathSync(current)]);
  try {
    for (const row of db.prepare('SELECT DISTINCT datapack_root FROM matches WHERE expires_at > ? AND datapack_root IS NOT NULL').all(Date.now() - grace)) keep.add(resolve(row.datapack_root));
  } finally { db.close(); }
  const versionsRoot = realpathSync(versions);
  for (const entry of readdirSync(versions, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-f\d]{40}$/.test(entry.name)) continue;
    const candidate = join(versionsRoot, entry.name);
    if (realpathSync(candidate) !== candidate || dirname(candidate) !== versionsRoot || keep.has(candidate) || entry.name === pin.commit) continue;
    if (readSource(candidate)?.commit !== entry.name) continue;
    if (lstatSync(candidate).mtimeMs > Date.now() - grace) continue;
    console.log(`${args.includes('--apply') ? 'Remove' : 'Would remove'} ${candidate}`);
    if (args.includes('--apply')) rmSync(candidate, { recursive: true });
  }
} else throw new Error('Usage: datapack.mjs fetch|activate|prune [--apply]');
