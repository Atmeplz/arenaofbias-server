// Wires the platform together: the site (static build + API) and the content handler.
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createArena } from './arena.mjs';
import { createAuth } from './auth.mjs';
import { createCapturer } from './capture.mjs';
import { createCatalog } from './catalog.mjs';
import { EFFORTS, EMOJIS } from './config.mjs';
import { createContentHandler } from './content.mjs';
import { openDatabase } from './db.mjs';
import {
  HttpError, assertSameOrigin, clientIp, createRouter, fail, isTrustedOrigin, rateLimit, readBody, readJson, resolveInside, sendJson, streamFile,
} from './http.mjs';
import { createLibrary } from './library.mjs';
import { createQuestions } from './questions.mjs';
import { createProfile } from './profile.mjs';

export function createPlatform({ config, limits }) {
  const serverVersion = process.env.SERVER_VERSION || (() => {
    try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { return 'dev'; }
  })();
  const db = openDatabase(join(config.dataDir, 'platform.db'));
  const questions = createQuestions(db);
  const profile = createProfile(db);
  const catalog = createCatalog(config.dist, questions);
  catalog.refresh();
  const auth = createAuth(db, { admins: config.admins, secureCookies: config.secureCookies, cookieSameSite: config.cookieSameSite, sessionTtl: limits.sessionTtl });
  const library = createLibrary({ db, catalog, config, limits });
  const arena = createArena({ db, catalog, library, limits });
  const capturer = createCapturer({ config, library });
  const limit = {
    auth: rateLimit(60e3, 10, '尝试次数太多，请一分钟后再试'),
    write: rateLimit(60e3, 120),
    drafts: rateLimit(10 * 60e3, 12, '上传太频繁，请稍后再试'),
    matches: rateLimit(60e3, 60),
  };
  const siteCsp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    `frame-src 'self' ${config.contentTemplate.replace('{token}', '*')}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');

  const signedIn = (ctx) => ctx.user ?? fail(401, '请先登录');
  const adminOnly = (ctx) => (signedIn(ctx).role === 'admin' ? ctx.user : fail(403, '仅管理员可以操作'));
  const publicList = (works, viewer) => works.map((work) => library.toPublic(work, viewer));
  const checkDatapack = (ctx, taskId) => {
    const snapshot = catalog.snapshot();
    if (!snapshot.task(taskId)) return snapshot; // Community questions are independent of the curated package.
    const supplied = ctx.req.headers['x-datapack-version'];
    if (supplied && supplied !== snapshot.commit) fail(409, '馆藏版本已更新，请刷新页面后重试', 'datapack_mismatch');
    return snapshot;
  };

  function bootstrap(user) {
    const snapshot = catalog.snapshot();
    const uploads = library.uploads();
    return {
      datapack: snapshot.commit,
      catalogDigest: snapshot.catalogDigest,
      apiVersion: 1,
      serverVersion,
      user: auth.public(user),
      site: {
        content: config.contentTemplate,
        cdn: config.cdn,
        capture: capturer.available,
        efforts: EFFORTS,
        emojis: EMOJIS,
        limits: { uploadBytes: limits.uploadBytes, coverBytes: limits.coverBytes, pendingPerUser: limits.pendingPerUser, provisionalGames: limits.provisionalGames },
      },
      works: publicList(uploads, user),
      questions: questions.all(),
      reactions: library.reactionSummary(user),
      arena: Object.fromEntries(catalog.tasks().map((task) => [task.id, { ...arena.poolStats(task.id), uploads: task.acceptsUploads }])),
      totals: arena.leaderboard().totals,
      me: user ? { votes: arena.votesBy(user.id), pending: library.pendingCount(user.id) } : null,
      review: user?.role === 'admin' ? { unverified: uploads.filter((work) => work.status === 'unverified').length } : null,
    };
  }

  const router = createRouter();
  router.on('GET', '/api/bootstrap', (ctx) => bootstrap(ctx.user));

  router.on('POST', '/api/auth/register', async (ctx) => {
    limit.auth(ctx.ip);
    const body = await readJson(ctx.req);
    const user = auth.register(body.name, body.password);
    auth.startSession(ctx.res, user.id);
    return { user: auth.public(user) };
  });
  router.on('POST', '/api/auth/login', async (ctx) => {
    limit.auth(ctx.ip);
    const body = await readJson(ctx.req);
    const user = auth.login(body.name, body.password);
    auth.startSession(ctx.res, user.id);
    return { user: auth.public(user) };
  });
  router.on('POST', '/api/auth/logout', (ctx) => {
    auth.endSession(ctx.req, ctx.res);
    return { ok: true };
  });

  router.on('POST', '/api/questions', async (ctx) => {
    const user = signedIn(ctx);
    limit.write(user.id);
    const question = questions.create(user, await readJson(ctx.req), catalog.tags());
    arena.invalidate();
    return { question };
  });

  // Upload: the raw ZIP/HTML body is inspected and staged as a draft for the trial load.
  router.on('POST', '/api/drafts', async (ctx) => {
    const user = signedIn(ctx);
    limit.drafts(user.id);
    const task = ctx.url.searchParams.get('task') ?? '';
    checkDatapack(ctx, task);
    const name = ctx.url.searchParams.get('name') ?? '';
    const buffer = await readBody(ctx.req, limits.uploadBytes);
    return { draft: library.createDraft(user, task, name, buffer, ctx.url.searchParams.get('template')) };
  });
  router.on('DELETE', '/api/drafts/:id', (ctx) => {
    library.discardDraft(signedIn(ctx), ctx.params.id);
    return { ok: true };
  });
  router.on('POST', '/api/works', async (ctx) => {
    const user = signedIn(ctx);
    limit.write(user.id);
    const body = await readJson(ctx.req, 6 * 1024 * 1024);
    checkDatapack(ctx, library.draftTask(String(body.draftId ?? '')));
    const work = library.submit(user, body);
    capturer.enqueue(work);
    arena.invalidate();
    return { work: library.toPublic(work, user) };
  });
  router.on('DELETE', '/api/works/:task/:id', (ctx) => {
    library.remove(signedIn(ctx), ctx.params.task, ctx.params.id);
    arena.invalidate();
    return { ok: true };
  });
  router.on('POST', '/api/works/:task/:id/review', async (ctx) => {
    const admin = adminOnly(ctx);
    const work = library.review(admin, ctx.params.task, ctx.params.id, await readJson(ctx.req));
    arena.invalidate();
    return { work: library.toPublic(work, admin) };
  });
  router.on('POST', '/api/works/:task/:id/reactions', async (ctx) => {
    const user = signedIn(ctx);
    limit.write(user.id);
    const body = await readJson(ctx.req);
    return library.react(user, ctx.params.task, ctx.params.id, String(body.emoji ?? ''));
  });

  router.on('GET', '/api/me', (ctx) => {
    const user = signedIn(ctx);
    return { questions: questions.byOwner(user.id), works: publicList(library.uploadsOf(user.id), user), votes: arena.votesBy(user.id), ...profile.summary(user) };
  });
  router.on('PATCH', '/api/me', async (ctx) => {
    const user = signedIn(ctx);
    limit.write(user.id);
    return { user: auth.public(auth.updateProfile(user, await readJson(ctx.req))) };
  });
  router.on('GET', '/api/review', (ctx) => {
    const admin = adminOnly(ctx);
    return { works: publicList(library.uploads(), admin), audit: library.auditLog() };
  });

  router.on('POST', '/api/arena/matches', async (ctx) => {
    limit.matches(ctx.user?.id ?? ctx.ip);
    const body = await readJson(ctx.req);
    const task = String(body.task ?? '');
    const snapshot = checkDatapack(ctx, task);
    return arena.createMatch(ctx.user, task, body.previous, snapshot);
  });
  router.on('POST', '/api/arena/matches/:id/vote', async (ctx) => {
    limit.write(ctx.user?.id ?? ctx.ip);
    const body = await readJson(ctx.req);
    return arena.vote(ctx.user, ctx.params.id, String(body.choice ?? ''));
  });
  router.on('GET', '/api/leaderboard', (ctx) => {
    const task = ctx.url.searchParams.get('task') || null;
    if (task && !catalog.task(task)) fail(404, '题目不存在');
    return arena.leaderboard({ task, by: ctx.url.searchParams.get('by') === 'model' ? 'model' : 'config' });
  });

  function serveSite(req, res, pathname) {
    const media = /^\/media\/(up-[a-z0-9]{8})\/(cover\.(?:png|jpg|webp)|first\.jpg|mobile\.jpg)$/.exec(pathname);
    if (pathname.startsWith('/media/')) {
      const found = media && resolveInside(library.mediaDir, `/${media[1]}/${media[2]}`);
      if (!found) return sendJson(res, 404, { error: '文件不存在' });
      return streamFile(req, res, found, { 'Cache-Control': 'public, max-age=300', 'Content-Security-Policy': "default-src 'none'" });
    }
    const found = resolveInside(config.dist, pathname);
    if (!found) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    const shell = found.file === join(config.dist, 'index.html');
    return streamFile(req, res, found, { 'Cache-Control': 'no-cache', ...(shell ? { 'Content-Security-Policy': siteCsp, 'Referrer-Policy': 'same-origin' } : {}) });
  }

  async function handleSite(req, res) {
    try {
      const url = new URL(req.url, 'http://site.invalid');
      if (req.headers.origin) {
        res.setHeader('Vary', 'Origin');
        if (isTrustedOrigin(req, config)) {
          res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
          res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
      }
      if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
        assertSameOrigin(req, config);
        const method = req.headers['access-control-request-method'];
        const route = router.match(method, url.pathname);
        if (!route) fail(404, '接口不存在');
        if (route.methodNotAllowed) fail(405, '不支持这个操作');
        const headers = String(req.headers['access-control-request-headers'] ?? '').toLowerCase().split(',').map((header) => header.trim()).filter(Boolean);
        if (headers.some((header) => !['content-type', 'x-datapack-version'].includes(header))) fail(403, '请求头无效');
        res.writeHead(204, {
          'Access-Control-Allow-Methods': method,
          'Access-Control-Allow-Headers': 'Content-Type, X-Datapack-Version',
          'Access-Control-Max-Age': '600',
        });
        return res.end();
      }
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') fail(405, '不支持这个操作');
        return serveSite(req, res, url.pathname);
      }
      const route = router.match(req.method, url.pathname);
      if (!route) fail(404, '接口不存在');
      if (route.methodNotAllowed) fail(405, '不支持这个操作');
      if (req.method !== 'GET' && req.method !== 'HEAD') assertSameOrigin(req, config);
      const ctx = { req, res, url, params: route.params, ip: clientIp(req, config.trustProxy), user: auth.userFrom(req) };
      return sendJson(res, 200, (await route.handler(ctx)) ?? { ok: true });
    } catch (error) {
      if (res.headersSent) return res.destroy();
      if (error instanceof HttpError) return sendJson(res, error.status, { error: error.message, ...(error.code ? { code: error.code } : {}) });
      console.error(error);
      return sendJson(res, 500, { error: '服务器出错了，请稍后再试' });
    }
  }

  return {
    db,
    auth,
    library,
    arena,
    handleSite,
    handleContent: createContentHandler({ config, library, arena, siteOrigins: config.siteOrigins }),
    async close() {
      await capturer.close();
      db.close();
    },
  };
}
