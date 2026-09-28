// 收录为馆藏（B 方案）：把过审投稿按 data 仓库的官方结构打包成 intake 分支推上去，
// CI 跑校验，人工收尾（截图、审查、合并）后正式发布。作品入库时立即挂 curated_as
// 标记，从公开列表和配对池退场，避免和将来的馆藏双胞胎双份出现。
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail } from './http.mjs';
import { transaction } from './db.mjs';

const slugOf = (text) => String(text ?? '').normalize('NFKD').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
// 占位封面：人工收尾（repo 的 npm run intake）会生成真实截图和封面。
const PLACEHOLDER_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
// 静态构建：与 repo 的 build-static-result.mjs 同义，但覆盖任意文件布局（投稿不保证 index.html+assets 结构）。
const BUILD_MJS = `import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const skip = new Set(['dist', 'node_modules', 'package.json', 'package-lock.json', 'build.mjs', 'README.md', 'docs']);
const out = join(process.cwd(), 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const name of readdirSync(process.cwd())) if (!skip.has(name)) cpSync(join(process.cwd(), name), join(out, name), { recursive: true });
`;

export function createCurator({ db, catalog, library, config }) {
  const repoDir = config.curateRepoDir ?? '/root/arenaofbias-data';
  const git = (args) => execFileSync('git', args, { cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const json = (path) => JSON.parse(readFileSync(join(repoDir, path), 'utf8'));
  const writeJson = (path, value) => writeFileSync(join(repoDir, path), `${JSON.stringify(value, null, 2)}\n`);

  function promote(admin, taskId, workId) {
    const work = library.work(taskId, workId);
    if (!work || work.curated) fail(404, '作品不存在', 'not_found');
    if (work.curatedAs) fail(409, '这件作品已经在收录流程里了');
    if (work.status !== 'verified') fail(409, '请先审核通过，再收录为馆藏');
    if (!catalog.snapshot().task(taskId)) fail(409, '这道题目不在馆藏题库（社区题先等题目收录），暂不能收录');
    if (!existsSync(repoDir)) fail(503, '服务器上的馆藏仓库还没配置');

    git(['fetch', 'origin', 'main']);
    git(['checkout', '-q', 'main']);
    git(['reset', '--hard', '-q', 'origin/main']);

    // 收录 id：从模型名出 slug，撞名就加序号。
    const manifest = json('results/manifest.json');
    const taken = new Set(manifest.map((entry) => `${entry.task ?? ''}/${entry.id}`));
    const base = slugOf(work.modelName) || 'work';
    let slug = base;
    for (let n = 2; taken.has(`${taskId}/${slug}`); n++) slug = `${base}-${n}`;
    const resultDir = join(repoDir, 'results', taskId, slug);
    rmSync(resultDir, { recursive: true, force: true });
    mkdirSync(join(resultDir, 'docs'), { recursive: true });
    cpSync(work.dir, resultDir, { recursive: true });
    writeFileSync(join(resultDir, 'build.mjs'), BUILD_MJS);
    writeFileSync(join(resultDir, 'package.json'), `${JSON.stringify({
      name: `intake-${taskId}-${slug}`, version: '1.0.0', private: true,
      scripts: { dev: 'vite', build: 'node build.mjs', preview: 'vite preview' },
    }, null, 2)}\n`);
    writeFileSync(join(resultDir, 'README.md'), `# ${work.title}\n\n${work.summary || ''}\n\n收录自投稿作品（${workId}，管理员 ${admin.name} 操作）。截图与封面由人工收尾生成。\n`);
    writeFileSync(join(resultDir, 'docs', 'cover.png'), PLACEHOLDER_PNG);
    manifest.push({ task: taskId, id: slug, model: work.modelName, modelId: work.modelId ?? undefined, title: work.title, description: work.summary || work.title, cover: 'docs/cover.png', addedAt: new Date().toISOString() });
    writeJson('results/manifest.json', manifest);

    // 模型档案：gallery.json 里已有就复用，没有就补一条（listed: false 的档案位）。
    const gallery = json('gallery.json');
    let modelId = work.modelId;
    if (!modelId || !gallery.models.some((m) => m.id === modelId)) {
      const seed = slugOf(work.modelName) || slug;
      modelId = seed;
      for (let n = 2; gallery.models.some((m) => m.id === modelId); n++) modelId = `${seed}-${n}`;
      const vendor = work.vendor || '未登记';
      gallery.models.push({ id: modelId, name: work.modelName, vendor, logo: 'assets/brands/generic.svg',
        brandUrl: 'https://arenaofbias.icu/', brandName: vendor, year: null, month: null, openWeights: null,
        contextK: null, modality: null, reasoning: null, priceTier: null, priceOut: null, popularity: null,
        aliases: [], difficulty: null, listed: false });
    }
    writeJson('gallery.json', gallery);

    const taskDoc = json(`tasks/${taskId}/task.json`);
    taskDoc.results.push({ id: slug, model: modelId, effort: work.effort ?? '', title: work.title,
      summary: work.summary ?? '', aliases: [`results/${taskId}/${slug}`], gallery: [], guide: {}, capture: {} });
    writeJson(`tasks/${taskId}/task.json`, taskDoc);

    const branch = `intake/${taskId}-${slug}`;
    git(['checkout', '-qB', branch]);
    git(['add', '-A']);
    git(['-c', 'user.name=arenaofbias-curate', '-c', 'user.email=curate@arenaofbias.icu', 'commit', '-q', '-m', `intake: ${taskId}/${slug}（收录自投稿 ${workId}）`]);
    git(['push', '-q', 'origin', branch]);

    transaction(db, () => library.markCurated(admin, work, `${taskId}/${slug}`));
    return { curatedId: `${taskId}/${slug}`, branch };
  }

  return { promote };
}
