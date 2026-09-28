// 收录为馆藏：投稿 → intake 分支（含打包文件）→ 数据库标记 + 退出公开列表和配对池。
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createPlatform } from '../server/app.mjs';
import { limits as defaultLimits } from '../server/config.mjs';

const PAGE = '<!doctype html><html><body><canvas></canvas><p>馆藏候选</p></body></html>';
const gitIn = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

describe('curate to intake branch', () => {
  let root;
  let platform;
  let site;
  let base;
  let repoDir;
  let remote;
  const jars = new Map();

  async function call(who, method, path, body, { raw = false } = {}) {
    const headers = { origin: base };
    if (jars.get(who)) headers.cookie = jars.get(who);
    if (body !== undefined && !raw) headers['content-type'] = 'application/json';
    const response = await fetch(base + path, { method, headers, body: raw ? body : body === undefined ? undefined : JSON.stringify(body) });
    const cookie = response.headers.get('set-cookie');
    if (cookie) jars.set(who, cookie.split(';')[0]);
    return { status: response.status, data: await response.json().catch(() => ({})) };
  }

  before(async () => {
    root = mkdtempSync(join(tmpdir(), 'curate-test-'));
    // data 仓库的本地假身：main 分支 + 远端裸仓库，结构和 arenaofbias-data 一致。
    remote = join(root, 'remote.git');
    repoDir = join(root, 'data-repo');
    execFileSync('git', ['init', '--bare', '-q', remote]);
    execFileSync('git', ['clone', '-q', remote, repoDir]);
    gitIn(repoDir, ['checkout', '-qB', 'main']);
    mkdirSync(join(repoDir, 'results'), { recursive: true });
    mkdirSync(join(repoDir, 'tasks', 'one'), { recursive: true });
    mkdirSync(join(repoDir, 'assets', 'brands'), { recursive: true });
    writeFileSync(join(repoDir, 'results', 'manifest.json'), '[]\n');
    writeFileSync(join(repoDir, 'tasks', 'one', 'PROMPT.md'), 'Build a page.\n');
    writeFileSync(join(repoDir, 'tasks', 'one', 'task.json'), JSON.stringify({ title: 'One', prompt: 'PROMPT.md', results: [] }, null, 2));
    writeFileSync(join(repoDir, 'gallery.json'), JSON.stringify({ title: 'test', models: [{ id: 'm-a', name: '模型甲', vendor: 'VA', logo: 'assets/brands/generic.svg', brandName: 'VA', brandUrl: 'https://va.example/' }] }, null, 2));
    writeFileSync(join(repoDir, 'assets', 'brands', 'generic.svg'), '<svg/>');
    gitIn(repoDir, ['add', '-A']);
    gitIn(repoDir, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'seed']);
    gitIn(repoDir, ['push', '-q', 'origin', 'main']);

    const dist = join(root, 'dist');
    mkdirSync(join(dist, 'results', 'one', 'a1'), { recursive: true });
    writeFileSync(join(dist, 'results', 'one', 'a1', 'index.html'), '<!doctype html><title>a1</title>');
    writeFileSync(join(dist, 'data.json'), JSON.stringify({
      title: 'test',
      models: [{ id: 'm-a', name: '模型甲', vendor: 'VA' }],
      tasks: [{ id: 'one', title: 'One', promptPending: false, results: [{ id: 'a1', model: 'm-a', effort: '', title: 'A1', summary: '', scene: 'results/one/a1/', captures: {}, gallery: [] }] }],
    }));
    const config = { dist, dataDir: join(root, 'data'), contentTemplate: '', siteOrigins: ['http://127.0.0.1'], admins: ['root'], cdn: [], capture: false, secureCookies: false, trustProxy: false, curateRepoDir: repoDir };
    platform = createPlatform({ config, limits: defaultLimits });
    site = createServer(platform.handleSite).listen(0, '127.0.0.1');
    await new Promise((resolve) => site.once('listening', resolve));
    base = `http://127.0.0.1:${site.address().port}`;
    for (const name of ['root', 'alice']) assert.equal((await call(name, 'POST', '/api/auth/register', { name, password: 'correct horse' })).status, 200);
  });

  after(async () => {
    site.close();
    await platform.close();
    rmSync(root, { recursive: true, force: true });
  });

  test('promoting packages the work into an intake branch and retires the upload', async () => {
    const staged = await call('alice', 'POST', '/api/drafts?task=one&name=candidate.html', PAGE, { raw: true });
    assert.equal(staged.status, 200);
    const submitted = await call('alice', 'POST', '/api/works', { draftId: staged.data.draft.id, confirmed: true, title: '馆藏候选', modelName: '国产新模型 X', tool: 'CLI' });
    assert.equal(submitted.status, 200);
    const id = submitted.data.work.id;

    // 未过审不能收录。
    assert.equal((await call('root', 'POST', `/api/admin/works/one/${id}/curate`)).status, 409);
    assert.equal((await call('root', 'POST', `/api/works/one/${id}/review`, { status: 'verified', show_gallery: true, show_arena: true })).status, 200);

    const promoted = await call('root', 'POST', `/api/admin/works/one/${id}/curate`);
    assert.equal(promoted.status, 200, JSON.stringify(promoted.data));
    const { curatedId, branch } = promoted.data;
    assert.match(curatedId, /^one\/国产?|^one\/x/);
    assert.match(branch, /^intake\/one-/);

    // 分支内容：文件、构建脚本、README、清单、task.json、模型档案。
    const slug = curatedId.split('/')[1];
    gitIn(repoDir, ['fetch', '-q', 'origin', branch]);
    gitIn(repoDir, ['checkout', '-q', branch]);
    assert.equal(readFileSync(join(repoDir, 'results', 'one', slug, 'index.html'), 'utf8'), PAGE);
    assert.ok(readFileSync(join(repoDir, 'results', 'one', slug, 'build.mjs'), 'utf8').includes("skip"));
    const manifest = JSON.parse(readFileSync(join(repoDir, 'results', 'manifest.json'), 'utf8'));
    assert.deepEqual(manifest.find((e) => e.id === slug && e.task === 'one') && true, true);
    const taskDoc = JSON.parse(readFileSync(join(repoDir, 'tasks', 'one', 'task.json'), 'utf8'));
    assert.equal(taskDoc.results[0].id, slug);
    const gallery = JSON.parse(readFileSync(join(repoDir, 'gallery.json'), 'utf8'));
    assert.ok(gallery.models.some((m) => m.name === '国产新模型 X'), '新模型档案已补进 gallery.json');

    // 数据库标记 + 退场：配对池、bootstrap、审核队列都不再出现。
    assert.equal(platform.db.prepare('SELECT curated_as FROM works WHERE id = ?').get(id).curated_as, curatedId);
    assert.equal((await call('alice', 'GET', '/api/bootstrap')).data.arena.one.works, 0);
    assert.ok(!(await call('root', 'GET', '/api/review')).data.works.some((w) => w.id === id));

    // 重复收录被拒。
    assert.equal((await call('root', 'POST', `/api/admin/works/one/${id}/curate`)).status, 409);
  });
});
