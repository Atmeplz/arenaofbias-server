// Platform rules: ranking, upload inspection and the upload → review → blind vote lifecycle.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';
import { createPlatform } from '../server/app.mjs';
import { limits as defaultLimits } from '../server/config.mjs';
import { inspectUpload } from '../server/inspect.mjs';
import { fitBradleyTerry, rankEntries } from '../server/ranking.mjs';

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.data ?? '');
    const packed = deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(entry.symlink ? (3 << 8) | 20 : 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(entry.symlink ? (0o120777 << 16) >>> 0 : 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    centrals.push(central, name);
    offset += 30 + name.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const PAGE = '<!doctype html><html><head><title>t</title></head><body><canvas></canvas><script src="app.js"></script></body></html>';
const inspect = (buffer, name = 'work.zip') => inspectUpload(buffer, name, { limits: defaultLimits, cdn: ['unpkg.com'] });

describe('ranking', () => {
  const work = (key) => ({ key, taskId: 't' });
  const keyOf = (w) => w.key;
  const votes = (list) => list.map(([a, b, choice], i) => ({ a: work(a), b: work(b), choice, userId: `u${i}` }));

  test('a consistently preferred entry ranks first, with the average at 1000', () => {
    const rows = rankEntries(votes([['x', 'y', 'a'], ['x', 'z', 'a'], ['y', 'z', 'a'], ['x', 'y', 'a']]), keyOf, { provisionalGames: 30 });
    assert.deepEqual(rows.map((row) => row.key), ['x', 'y', 'z']);
    assert.ok(Math.abs(rows.reduce((sum, row) => sum + row.score, 0) / 3 - 1000) <= 1);
    assert.ok(rows.every((row) => row.provisional));
  });

  test('ties count half for each side and the result ignores vote order', () => {
    const list = [['x', 'y', 'a'], ['x', 'y', 'tie'], ['y', 'x', 'b'], ['y', 'z', 'tie']];
    const forward = rankEntries(votes(list), keyOf, { provisionalGames: 30 });
    const backward = rankEntries(votes([...list].reverse()), keyOf, { provisionalGames: 30 });
    assert.deepEqual(forward.map((row) => [row.key, row.score]), backward.map((row) => [row.key, row.score]));
    const x = forward.find((row) => row.key === 'x');
    assert.equal(x.draws, 1);
    assert.equal(x.winRate, 2.5 / 3);
  });

  test('more comparisons narrow the interval; same-entry votes are ignored', () => {
    const few = fitBradleyTerry(2, [{ a: 0, b: 1, y: 1 }]);
    const many = fitBradleyTerry(2, Array.from({ length: 40 }, (_, i) => ({ a: 0, b: 1, y: i % 4 ? 1 : 0 })));
    assert.ok(many[0].interval < few[0].interval);
    assert.deepEqual(rankEntries(votes([['x', 'x', 'a']]), keyOf, { provisionalGames: 30 }), []);
  });
});

describe('upload inspection', () => {
  test('a single HTML file becomes index.html', () => {
    const result = inspect(Buffer.from('<!doctype html><html><body><h1>hi</h1></body></html>'), 'page.html');
    assert.equal(result.entry, 'index.html');
    assert.equal(result.kind, 'html');
  });

  test('a wrapping folder is stripped and dist/ becomes the served root', () => {
    const result = inspect(zip([
      { name: 'project/package.json', data: '{}' },
      { name: 'project/src/main.js', data: '' },
      { name: 'project/dist/index.html', data: '<html><head><script type="module" src="/assets/app.js"></script></head></html>' },
      { name: 'project/dist/assets/app.js', data: 'console.log(1)' },
    ]));
    assert.equal(result.root, 'dist');
    assert.equal(result.entry, 'index.html');
  });

  test('unsafe or incomplete archives are refused with a reason', () => {
    assert.throws(() => inspect(zip([{ name: '../evil.html', data: PAGE }])), /不安全/);
    assert.throws(() => inspect(zip([{ name: 'index.html', data: PAGE }, { name: 'node_modules/x/index.js', data: '' }])), /node_modules/);
    assert.throws(() => inspect(zip([{ name: 'index.html', data: PAGE }, { name: 'app.js', symlink: true, data: '/etc/passwd' }])), /符号链接/);
    assert.throws(() => inspect(zip([{ name: 'package.json', data: '{}' }, { name: 'src/main.js', data: '' }])), /构建/);
    assert.throws(() => inspect(zip([{ name: 'index.html', data: PAGE }])), /app\.js/);
    assert.throws(() => inspect(Buffer.from('plain text'), 'notes.txt'), /ZIP/);
  });

  test('external references are reported, allowlisted CDNs are noted', () => {
    const blocked = inspect(zip([{ name: 'index.html', data: '<html><script src="https://evil.example/x.js"></script></html>' }]));
    assert.equal(blocked.checks.find((check) => check.id === 'external').state, 'warn');
    const cdn = inspect(zip([{ name: 'index.html', data: '<html><script type="importmap">{"imports":{"three":"https://unpkg.com/three"}}</script></html>' }]));
    assert.equal(cdn.checks.find((check) => check.id === 'external').state, 'info');
  });
});

describe('platform lifecycle', () => {
  let root;
  let platform;
  let site;
  let content;
  let base;
  const jars = new Map();

  async function call(who, method, path, body, { raw = false, origin = true } = {}) {
    const headers = {};
    if (jars.get(who)) headers.cookie = jars.get(who);
    if (origin) headers.origin = base;
    if (body !== undefined && !raw) headers['content-type'] = 'application/json';
    const response = await fetch(base + path, { method, headers, body: raw ? body : body === undefined ? undefined : JSON.stringify(body) });
    const cookie = response.headers.get('set-cookie');
    if (cookie) jars.set(who, cookie.split(';')[0]);
    return { status: response.status, data: await response.json() };
  }

  function fetchContent(url) {
    const { host, pathname } = new URL(url);
    return new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: content.address().port, path: pathname, headers: { host } }, (res) => {
        let text = '';
        res.on('data', (chunk) => { text += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  before(async () => {
    root = mkdtempSync(join(tmpdir(), 'same-prompt-'));
    const dist = join(root, 'dist');
    const results = [['a1', 'm-a', 'High'], ['b1', 'm-b', '']];
    for (const [id] of results) {
      mkdirSync(join(dist, 'results', 'one', id), { recursive: true });
      writeFileSync(join(dist, 'results', 'one', id, 'index.html'), `<!doctype html><title>${id}</title><p>${id}</p>`);
    }
    writeFileSync(join(dist, 'data.json'), JSON.stringify({
      title: 'test',
      models: [{ id: 'm-a', name: 'Model A', vendor: 'VA' }, { id: 'm-b', name: 'Model B', vendor: 'VB' }],
      tasks: [
        { id: 'one', title: 'One', promptPending: false, results: results.map(([id, model, effort]) => ({ id, model, effort, title: id.toUpperCase(), summary: '', scene: `results/one/${id}/`, captures: {}, gallery: [] })) },
        { id: 'closed', title: 'Closed', promptPending: true, results: [] },
      ],
    }));
    const config = { dist, dataDir: join(root, 'data'), contentTemplate: '', siteOrigins: ['http://127.0.0.1'], admins: ['root'], cdn: [], capture: false, secureCookies: false, trustProxy: false };
    platform = createPlatform({ config, limits: { ...defaultLimits, pendingPerUser: 2 } });
    site = createServer(platform.handleSite).listen(0, '127.0.0.1');
    content = createServer(platform.handleContent).listen(0, '127.0.0.1');
    await Promise.all([site, content].map((server) => new Promise((resolve) => server.once('listening', resolve))));
    base = `http://127.0.0.1:${site.address().port}`;
    config.contentTemplate = `http://{token}.localhost:${content.address().port}`;
    for (const name of ['alice', 'bob', 'root']) assert.equal((await call(name, 'POST', '/api/auth/register', { name, password: 'correct horse' })).status, 200);
  });

  after(async () => {
    site.close();
    content.close();
    await platform.close();
    rmSync(root, { recursive: true, force: true });
  });

  let upload;
  test('uploads are staged, trial-loaded with the probe, then submitted as unverified', async () => {
    const html = '<!doctype html><html><head><title>mine</title></head><body><h1>mine</h1></body></html>';
    assert.equal((await call('alice', 'POST', '/api/drafts?task=one&name=mine.html', html, { raw: true, origin: false })).status, 403);
    assert.equal((await call('alice', 'POST', '/api/drafts?task=closed&name=mine.html', html, { raw: true })).status, 409);
    const staged = await call('alice', 'POST', '/api/drafts?task=one&name=mine.html', html, { raw: true });
    assert.equal(staged.status, 200);
    const preview = await fetchContent(staged.data.draft.preview);
    assert.equal(preview.status, 200);
    assert.match(preview.text, /<head><script src="\/__sp_probe\.js"><\/script>/);
    assert.match(preview.headers['content-security-policy'], /^sandbox allow-scripts/);

    const form = { draftId: staged.data.draft.id, title: 'Mine', modelName: 'Model X', vendor: 'VX', effort: 'high', tool: 'CLI', trial: { loaded: true, loadMs: 120 } };
    assert.equal((await call('alice', 'POST', '/api/works', form)).status, 400);
    const submitted = await call('alice', 'POST', '/api/works', { ...form, confirmed: true });
    assert.equal(submitted.status, 200);
    upload = submitted.data.work;
    assert.equal(upload.status, 'unverified');
    assert.equal(upload.effort, 'High');
    assert.equal((await fetchContent(upload.scene)).status, 200);
    const boot = await call('bob', 'GET', '/api/bootstrap');
    assert.equal(boot.data.arena.one.works, 2, 'unverified works stay out of blind comparisons');
    assert.equal(boot.data.works[0].checks, undefined, 'upload reports are private');
  });

  test('blind matches reveal nothing until the vote, and each pair counts once per voter', async () => {
    const match = await call('alice', 'POST', '/api/arena/matches', { task: 'one' });
    assert.equal(match.status, 200);
    assert.deepEqual(Object.keys(match.data).sort(), ['a', 'b', 'counted', 'id', 'task']);
    for (const url of [match.data.a, match.data.b]) assert.match(new URL(url).hostname, /^m[0-9a-f]{32}\.localhost$/);
    assert.equal((await fetchContent(match.data.a)).status, 200);
    const vote = await call('alice', 'POST', `/api/arena/matches/${match.data.id}/vote`, { choice: 'a' });
    assert.equal(vote.data.counted, true);
    assert.ok(['A1', 'B1'].includes(vote.data.a.title));
    assert.equal((await call('alice', 'POST', `/api/arena/matches/${match.data.id}/vote`, { choice: 'b' })).status, 409);
    assert.equal((await call('alice', 'POST', '/api/arena/matches', { task: 'one' })).data.code, 'exhausted');
    const board = await call('alice', 'GET', '/api/leaderboard?task=one');
    assert.equal(board.data.totals.votes, 1);
    assert.equal(board.data.rows.length, 2);
  });

  test('review moves uploads into the arena; questioned works stop counting and interacting', async () => {
    assert.equal((await call('alice', 'POST', `/api/works/one/${upload.id}/review`, { status: 'verified' })).status, 403);
    assert.equal((await call('root', 'POST', `/api/works/one/${upload.id}/review`, { status: 'verified' })).status, 200);
    assert.equal((await call('bob', 'GET', '/api/bootstrap')).data.arena.one.entries, 3);

    // Alice never meets her own work; Bob may.
    for (let i = 0; i < 3; i++) {
      const match = await call('bob', 'POST', '/api/arena/matches', { task: 'one' });
      if (match.status !== 200) break;
      await call('bob', 'POST', `/api/arena/matches/${match.data.id}/vote`, { choice: 'tie' });
    }
    assert.equal((await call('bob', 'GET', '/api/leaderboard?task=one')).data.totals.votes, 4);
    assert.equal((await call('bob', 'POST', `/api/works/one/${upload.id}/reactions`, { emoji: '🔥' })).data.counts['🔥'], 1);

    assert.equal((await call('root', 'POST', `/api/works/one/${upload.id}/review`, { status: 'questioned' })).status, 400);
    assert.equal((await call('root', 'POST', `/api/works/one/${upload.id}/review`, { status: 'questioned', reason: '无法核实' })).status, 200);
    assert.equal((await call('bob', 'POST', `/api/works/one/${upload.id}/reactions`, { emoji: '👀' })).status, 409);
    assert.equal((await call('bob', 'GET', '/api/leaderboard?task=one')).data.totals.votes, 2, 'votes involving the questioned work drop out');
  });

  test('only the author or an admin can delete an upload', async () => {
    assert.equal((await call('bob', 'DELETE', `/api/works/one/${upload.id}`)).status, 403);
    assert.equal((await call('alice', 'DELETE', `/api/works/one/${upload.id}`)).status, 200);
    assert.equal((await fetchContent(upload.scene)).status, 410);
    assert.equal((await call('root', 'DELETE', '/api/works/one/a1')).status, 409, 'curated works are managed in the repository');
  });

  test('user administration is admin-only, guards self-demotion and writes audit', async () => {
    assert.equal((await call('nobody', 'GET', '/api/admin/users')).status, 401);
    assert.equal((await call('alice', 'GET', '/api/admin/users')).status, 403);

    const list = await call('root', 'GET', '/api/admin/users');
    assert.equal(list.status, 200);
    const alice = list.data.users.find((user) => user.name === 'alice');
    const root = list.data.users.find((user) => user.name === 'root');
    assert.ok(alice && root);
    assert.deepEqual(Object.keys(alice).sort(), ['createdAt', 'id', 'name', 'role'], 'the list never carries salt or hash');

    assert.equal((await call('alice', 'POST', `/api/admin/users/${alice.id}/role`, { role: 'admin' })).status, 403, 'members cannot promote anyone');
    const promoted = await call('root', 'POST', `/api/admin/users/${alice.id}/role`, { role: 'admin' });
    assert.equal(promoted.status, 200);
    assert.equal(promoted.data.user.role, 'admin');
    assert.equal((await call('alice', 'GET', '/api/admin/users')).status, 200, 'promotion takes effect on the next request');

    const demoted = await call('root', 'POST', `/api/admin/users/${alice.id}/role`, { role: 'member' });
    assert.equal(demoted.status, 200);
    assert.equal((await call('alice', 'GET', '/api/admin/users')).status, 403, 'demotion takes effect on the next request');

    assert.equal((await call('root', 'POST', `/api/admin/users/${root.id}/role`, { role: 'member' })).status, 409, 'an admin cannot demote itself');
    assert.equal((await call('root', 'POST', `/api/admin/users/${alice.id}/role`, { role: 'boss' })).status, 400, 'unknown roles are refused');
    assert.equal((await call('root', 'POST', '/api/admin/users/nope/role', { role: 'admin' })).status, 404);

    const review = await call('root', 'GET', '/api/review');
    const entries = review.data.audit.filter((row) => row.action === 'role');
    assert.ok(entries.length >= 2, 'role changes are written to the audit log');
    assert.match(entries[0].detail, /alice/);
  });
});
