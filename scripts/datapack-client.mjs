// Owned by arenaofbias-data. Vendored unchanged by gallery/server; the integration
// check compares these copies. Runtime dependencies: Node built-ins only.
import { createReadStream, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, openSync, writeSync, closeSync, renameSync, rmSync, cpSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname, join, resolve } from 'node:path';

export const SOURCE_FILE = '.datapack-source.json';
export function readSource(root) {
  try { return JSON.parse(readFileSync(join(root, SOURCE_FILE), 'utf8')); }
  catch { return null; }
}

export function validatePackage(root) {
  const data = JSON.parse(readFileSync(join(root, 'data.json'), 'utf8'));
  if ((data.schemaVersion ?? 1) !== 1) throw new Error(`Unsupported datapack schema ${data.schemaVersion}`);
  if (!Array.isArray(data.tasks) || !data.tasks.length || !Array.isArray(data.models)) throw new Error('Invalid datapack catalog');
  for (const task of data.tasks) for (const work of task.results ?? []) {
    if (!work.scene || !existsSync(join(root, work.scene, 'index.html'))) throw new Error(`Missing entry: ${task.id}/${work.id}`);
  }
  if (data.schemaVersion && !existsSync(join(root, 'sandtable-bridge.js'))) throw new Error('Versioned datapack must include its scene bridge');
  return data;
}

// Streaming ustar/PAX extraction: memory is bounded by stream chunks and one
// metadata header, rather than the compressed archive plus the entire tar.
export async function extractArchive(archive, destination) {
  const input = createReadStream(archive);
  const stream = input.pipe(createGunzip());
  input.on('error', error => stream.destroy(error));
  const iterator = stream[Symbol.asyncIterator]();
  let chunk = Buffer.alloc(0), offset = 0, root = null, paxPath = null, files = 0;
  async function consume(size, accept) {
    let remaining = size;
    while (remaining) {
      if (offset === chunk.length) {
        const next = await iterator.next();
        if (next.done) throw new Error('Truncated datapack archive');
        chunk = next.value; offset = 0;
      }
      const length = Math.min(remaining, chunk.length - offset);
      accept?.(chunk.subarray(offset, offset + length));
      offset += length; remaining -= length;
    }
  }
  async function bytes(size) {
    const result = Buffer.alloc(size); let at = 0;
    await consume(size, part => { part.copy(result, at); at += part.length; });
    return result;
  }
  const string = buffer => buffer.toString('utf8').replace(/\0.*$/s, '');
  try {
    for (;;) {
      const header = await bytes(512);
      if (header.every(byte => byte === 0)) {
        // Drain gzip through its checksum/trailer without retaining tar padding.
        while (!(await iterator.next()).done) { /* bounded stream chunks */ }
        break;
      }
      const size = parseInt(string(header.subarray(124, 136)).trim(), 8) || 0;
      if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid tar size');
      const type = String.fromCharCode(header[156]);
      if (type === 'x' || type === 'g') {
        if (size > 1024 * 1024) throw new Error('Oversized tar metadata');
        const body = (await bytes(size)).toString('utf8');
        if (type === 'x') paxPath = body.match(/^\d+ path=(.+)$/m)?.[1] ?? null;
      } else {
        const prefix = string(header.subarray(345, 500));
        const name = paxPath ?? [prefix, string(header.subarray(0, 100))].filter(Boolean).join('/');
        paxPath = null;
        if (/^[\\/]|^[a-z]:/i.test(name) || name.includes('\\') || name.split('/').includes('..')) throw new Error(`Unsafe tar path: ${name}`);
        const parts = name.split('/');
        root ??= parts[0];
        if (!root || parts[0] !== root) throw new Error('Expected one codeload archive root');
        const relative = parts.slice(1).join('/');
        if (type === '5') await consume(size);
        else {
          if (type !== '0' && type !== '\0' || !relative) throw new Error(`Unsupported tar entry: ${name}`);
          const target = join(destination, relative);
          mkdirSync(dirname(target), { recursive: true });
          const fd = openSync(target, 'wx');
          try { await consume(size, part => { let at = 0; while (at < part.length) at += writeSync(fd, part, at); }); }
          finally { closeSync(fd); }
          files++;
        }
      }
      await consume((512 - size % 512) % 512);
    }
  } finally { input.destroy(); stream.destroy(); }
  if (!files) throw new Error('Empty datapack archive');
  return files;
}

export async function fetchDatapack({ pin, target, validate = validatePackage, immutable = false, localSource = null }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(pin.repo) || !/^[a-f\d]{40}$/.test(pin.commit)) throw new Error('Pin requires owner/repo and a full commit SHA');
  target = resolve(target);
  const existing = readSource(target);
  if (!localSource && existing?.source === 'github' && existing.repo === pin.repo && existing.commit === pin.commit) {
    try {
      validate(target);
      console.log(`Using validated datapack ${pin.commit}`);
      return existing;
    } catch (error) {
      if (immutable) throw error;
      console.warn(`Cached datapack failed validation; downloading again: ${error.message}`);
    }
  }
  if (immutable && existsSync(target)) throw new Error(`Refusing to replace immutable version: ${target}`);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = mkdtempSync(join(dirname(target), '.datapack-download-'));
  const unpacked = join(temporary, 'package');
  try {
    let origin;
    if (localSource) {
      cpSync(resolve(localSource), unpacked, { recursive: true });
      // Local development never claims the configured release SHA.
      origin = { source: 'local', path: resolve(localSource) };
    } else {
      const url = `https://codeload.github.com/${pin.repo}/tar.gz/${pin.commit}`;
      const archive = join(temporary, 'archive.tar.gz');
      console.log(`Downloading ${url}`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Datapack download failed: HTTP ${response.status}`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
      await extractArchive(archive, unpacked);
      origin = { source: 'github', repo: pin.repo, commit: pin.commit };
    }
    validate(unpacked);
    writeFileSync(join(unpacked, SOURCE_FILE), JSON.stringify(origin));
    // Only the explicitly selected generated cache may be replaced. Immutable
    // server releases are installed once and never overwritten.
    if (existsSync(target)) rmSync(target, { recursive: true });
    renameSync(unpacked, target);
    return origin;
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
