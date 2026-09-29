import { existsSync, realpathSync, renameSync, rmdirSync, rmSync, symlinkSync } from 'node:fs';

function removeJunction(path) {
  try { rmdirSync(path); }
  catch (error) {
    if (error.code !== 'ENOTDIR') throw error;
    rmSync(path);
  }
}

export function switchCurrent(current, target, { windows = process.platform === 'win32', rename = renameSync } = {}) {
  const previous = existsSync(current) ? realpathSync(current) : null;
  const pending = `${current}.next-${process.pid}`;
  symlinkSync(target, pending, windows ? 'junction' : 'dir');
  let removed = false;
  try {
    if (windows && previous) { removeJunction(current); removed = true; }
    rename(pending, current);
  } catch (error) {
    if (existsSync(pending)) (windows ? removeJunction : rmSync)(pending);
    let restored = !removed;
    if (removed) {
      try { symlinkSync(previous, current, 'junction'); restored = true; }
      catch (restoreError) {
        throw new Error(`Data pack switch failed: ${error.message}; previous link could not be restored: ${restoreError.message}`);
      }
    }
    throw new Error(`Data pack switch failed: ${error.message}; previous link ${restored ? 'was restored' : 'is missing'}.`);
  }
}
