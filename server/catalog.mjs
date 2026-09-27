// The curated archive, read from the build output (dist/data.json). Curated works are
// governed by the repository intake workflow, so the platform treats them as verified.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const effortKey = (effort) => String(effort ?? '').normalize('NFKC').trim().toLowerCase();
export const modelKey = (work) => work.modelId ?? `x:${work.modelName.normalize('NFKC').trim().toLowerCase()}`;
// A leaderboard entry: one model at one effort level ("配置"), or the model across efforts.
export const entityKey = (work, by = 'config') => (by === 'model' ? modelKey(work) : `${modelKey(work)}|${effortKey(work.effort)}`);

export function createCatalog(dist) {
  const file = join(dist, 'data.json');
  let loadedAt = -1;
  let data = null;
  let tasks = new Map();
  let models = new Map();
  let digests = null;

  function load() {
    if (!existsSync(file)) throw new Error(`找不到 ${file}。请先运行 npm run build（或 node scripts/assemble.mjs）。`);
    const mtime = statSync(file).mtimeMs;
    if (mtime === loadedAt) return;
    data = JSON.parse(readFileSync(file, 'utf8'));
    models = new Map(data.models.map((model) => [model.id, model]));
    tasks = new Map(data.tasks.map((task) => [task.id, {
      id: task.id,
      title: task.title,
      acceptsUploads: !task.promptPending,
      works: new Map(task.results.map((result) => [result.id, curatedWork(task.id, result)])),
    }]));
    digests = null;
    loadedAt = mtime;
  }

  function curatedWork(taskId, result) {
    const model = models.get(result.model);
    return {
      taskId,
      id: result.id,
      curated: true,
      status: 'verified',
      title: result.title,
      summary: result.summary ?? '',
      modelId: result.model,
      modelName: model?.name ?? result.model,
      vendor: model?.vendor ?? '',
      effort: result.effort ?? '',
      tool: result.sourceLabel ?? '',
      ownerId: null,
      scene: result.scene,
      dir: result.scene ? join(dist, result.scene) : null,
      cover: Object.values(result.captures ?? {})[0] ?? result.gallery?.[0]?.src ?? null,
    };
  }

  return {
    refresh: load,
    // Changes whenever the build is re-assembled; caches derived from the catalog key on it.
    get version() { return loadedAt; },
    get title() { load(); return data.title; },
    task(id) { load(); return tasks.get(id) ?? null; },
    tasks() { load(); return [...tasks.values()]; },
    model(id) { load(); return models.get(id) ?? null; },
    models() { load(); return [...models.values()]; },
    work(taskId, id) { load(); return tasks.get(taskId)?.works.get(id) ?? null; },
    works(taskId) { load(); return [...(tasks.get(taskId)?.works.values() ?? [])]; },
    // Entry-page digests of curated works: an upload with the same entry page is flagged for review.
    duplicateOf(entryDigest) {
      load();
      if (!digests) {
        digests = new Map();
        for (const task of tasks.values()) {
          for (const work of task.works.values()) {
            const entry = work.dir && join(work.dir, 'index.html');
            if (entry && existsSync(entry)) digests.set(createHash('sha256').update(readFileSync(entry)).digest('hex'), work);
          }
        }
      }
      return digests.get(entryDigest) ?? null;
    },
  };
}
