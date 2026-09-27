// Every work the platform knows: curated works from the build plus submitted uploads.
// Uploads move through unverified → verified | questioned; drafts hold a staged upload
// until its author has watched the trial load and submits it.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { EFFORTS, EMOJIS } from './config.mjs';
import { transaction } from './db.mjs';
import { fail } from './http.mjs';
import { inspectUpload } from './inspect.mjs';

const token = (prefix) => `${prefix}${randomBytes(16).toString('hex')}`;
const workId = () => `up-${[...randomBytes(8)].map((byte) => (byte % 36).toString(36)).join('')}`;
const iso = (ms) => (ms ? new Date(ms).toISOString() : null);
const clip = (value, max) => String(value ?? '').normalize('NFKC').trim().slice(0, max);
const COVER_TYPES = [
  { ext: 'png', mime: 'image/png', test: (b) => b.readUInt32BE(0) === 0x89504e47 },
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

function writeTree(target, files) {
  const base = resolve(target);
  for (const [path, data] of files) {
    const file = resolve(base, path);
    if (!file.startsWith(base + sep)) fail(400, '文件路径不合法');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data);
  }
}

export function createLibrary({ db, catalog, config, limits }) {
  const dirs = { drafts: join(config.dataDir, 'drafts'), works: join(config.dataDir, 'works'), media: join(config.dataDir, 'media') };
  for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true });
  const originOf = (key) => config.contentTemplate.replace('{token}', key);

  const WORK = `SELECT works.*, owner.name AS owner_name, reviewer.name AS reviewer_name FROM works
    LEFT JOIN users owner ON owner.id = works.owner_id LEFT JOIN users reviewer ON reviewer.id = works.reviewed_by`;
  const q = {
    draft: db.prepare('SELECT * FROM drafts WHERE id = ?'),
    draftByToken: db.prepare('SELECT * FROM drafts WHERE token = ? AND expires_at > ?'),
    draftsOf: db.prepare('SELECT id FROM drafts WHERE owner_id = ? ORDER BY created_at DESC'),
    expiredDrafts: db.prepare('SELECT id FROM drafts WHERE expires_at <= ?'),
    insertDraft: db.prepare(`INSERT INTO drafts (id, owner_id, task_id, token, source_name, root, entry, file_count, bytes, digest, checks, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    deleteDraft: db.prepare('DELETE FROM drafts WHERE id = ?'),
    work: db.prepare(`${WORK} WHERE works.id = ? AND works.deleted_at IS NULL`),
    workByKey: db.prepare(`${WORK} WHERE works.content_key = ? AND works.deleted_at IS NULL`),
    workByDigest: db.prepare('SELECT id, title, task_id FROM works WHERE digest = ? AND deleted_at IS NULL LIMIT 1'),
    works: db.prepare(`${WORK} WHERE works.deleted_at IS NULL ORDER BY works.created_at DESC`),
    worksOfTask: db.prepare(`${WORK} WHERE works.task_id = ? AND works.deleted_at IS NULL`),
    worksOfOwner: db.prepare(`${WORK} WHERE works.owner_id = ? AND works.deleted_at IS NULL ORDER BY works.created_at DESC`),
    pendingOf: db.prepare("SELECT COUNT(*) AS n FROM works WHERE owner_id = ? AND status = 'unverified' AND deleted_at IS NULL"),
    insertWork: db.prepare(`INSERT INTO works (id, task_id, owner_id, title, summary, model_id, model_name, vendor, effort, tool, note, content_key,
      source_name, root, entry, file_count, bytes, digest, checks, trial, cover, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    review: db.prepare(`UPDATE works SET status = ?, status_reason = ?, model_id = ?, model_name = ?, vendor = ?, effort = ?,
      reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`),
    remove: db.prepare('UPDATE works SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?'),
    captures: db.prepare('UPDATE works SET captures = ? WHERE id = ?'),
    reaction: db.prepare('SELECT 1 FROM reactions WHERE task_id = ? AND work_id = ? AND user_id = ? AND emoji = ?'),
    addReaction: db.prepare('INSERT INTO reactions (task_id, work_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)'),
    dropReaction: db.prepare('DELETE FROM reactions WHERE task_id = ? AND work_id = ? AND user_id = ? AND emoji = ?'),
    reactionCounts: db.prepare('SELECT task_id, work_id, emoji, COUNT(*) AS n FROM reactions GROUP BY task_id, work_id, emoji'),
    workReactions: db.prepare('SELECT emoji, COUNT(*) AS n FROM reactions WHERE task_id = ? AND work_id = ? GROUP BY emoji'),
    myReactions: db.prepare('SELECT task_id, work_id, emoji FROM reactions WHERE user_id = ?'),
    audit: db.prepare('INSERT INTO audit (at, actor_id, actor_name, action, task_id, work_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    auditLog: db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?'),
  };

  function fromRow(row) {
    return {
      taskId: row.task_id,
      id: row.id,
      curated: false,
      status: row.status,
      reason: row.status_reason,
      title: row.title,
      summary: row.summary,
      modelId: row.model_id,
      modelName: row.model_name,
      vendor: row.vendor,
      effort: row.effort,
      tool: row.tool,
      note: row.note,
      ownerId: row.owner_id,
      ownerName: row.owner_name ?? null,
      reviewerName: row.reviewer_name ?? null,
      reviewedAt: row.reviewed_at,
      contentKey: row.content_key,
      root: row.root,
      entry: row.entry,
      dir: join(dirs.works, row.id, row.root),
      files: row.file_count,
      bytes: row.bytes,
      digest: row.digest,
      sourceName: row.source_name,
      checks: JSON.parse(row.checks),
      trial: JSON.parse(row.trial),
      captures: JSON.parse(row.captures),
      cover: row.cover,
      createdAt: row.created_at,
    };
  }

  function audit(actor, action, work, detail = '') {
    q.audit.run(Date.now(), actor?.id ?? null, actor?.name ?? '系统', action, work?.taskId ?? null, work?.id ?? null, detail);
  }

  function upload(taskId, id) {
    const row = q.work.get(id);
    return row && row.task_id === taskId ? fromRow(row) : null;
  }

  function purgeDrafts() {
    for (const { id } of q.expiredDrafts.all(Date.now())) {
      rmSync(join(dirs.drafts, id), { recursive: true, force: true });
      q.deleteDraft.run(id);
    }
  }
  purgeDrafts();
  // Directories left behind by an interrupted upload.
  for (const name of readdirSync(dirs.drafts)) if (!q.draft.get(name)) rmSync(join(dirs.drafts, name), { recursive: true, force: true });

  const isEligible = (work) => Boolean(work && work.status === 'verified' && work.dir);
  const isInteractive = (work) => Boolean(work && work.status !== 'questioned');

  function reactionsOf(taskId, id) {
    return Object.fromEntries(q.workReactions.all(taskId, id).map((row) => [row.emoji, row.n]));
  }

  function publicDraft(row) {
    return {
      id: row.id,
      task: row.task_id,
      sourceName: row.source_name,
      root: row.root,
      entry: row.entry,
      files: row.file_count,
      bytes: row.bytes,
      checks: JSON.parse(row.checks),
      preview: `${originOf(row.token)}/`,
      expiresAt: iso(row.expires_at),
    };
  }

  function sanitizeTrial(trial) {
    const t = trial && typeof trial === 'object' ? trial : {};
    const n = (value, max = 1e7) => (Number.isFinite(value) ? Math.max(0, Math.min(max, Math.round(value))) : null);
    const strings = (value, count) => (Array.isArray(value) ? value.slice(0, count).map((item) => clip(item, 200)).filter(Boolean) : []);
    return {
      loaded: t.loaded === true,
      loadMs: n(t.loadMs),
      errors: n(t.errors, 1000) ?? 0,
      errorSamples: strings(t.errorSamples, 3),
      failedResources: strings(t.failedResources, 5),
      blocked: strings(t.blocked, 5),
      canvases: n(t.canvases, 100),
      media: n(t.media, 10000),
      words: n(t.words),
    };
  }

  function coverFrom(dataUrl) {
    if (!dataUrl) return null;
    const match = /^data:image\/[a-z+.-]+;base64,([a-z0-9+/=\s]+)$/i.exec(String(dataUrl));
    if (!match) fail(400, '封面图片格式无效');
    const buffer = Buffer.from(match[1], 'base64');
    if (buffer.length > limits.coverBytes) fail(413, '封面图片不能超过 3 MB');
    const type = COVER_TYPES.find((candidate) => buffer.length > 12 && candidate.test(buffer));
    if (!type) fail(400, '封面只支持 PNG、JPEG 或 WebP');
    return { buffer, type };
  }

  function identity(body) {
    const modelId = body.modelId ? String(body.modelId) : null;
    if (modelId) {
      const model = catalog.model(modelId);
      if (!model) fail(400, '所选模型不存在');
      return { modelId, modelName: model.name, vendor: model.vendor };
    }
    const modelName = clip(body.modelName, 60);
    if (!modelName) fail(400, '请填写模型名称');
    return { modelId: null, modelName, vendor: clip(body.vendor, 40) };
  }

  const effortOf = (value) => {
    const effort = clip(value, 20);
    const known = EFFORTS.find((item) => item.toLowerCase() === effort.toLowerCase());
    return known ?? effort;
  };

  return {
    isEligible,
    isInteractive,
    originOf,
    audit,
    mediaDir: dirs.media,

    work(taskId, id) {
      return catalog.work(taskId, id) ?? upload(taskId, id);
    },
    byContentKey(key) {
      const row = q.workByKey.get(key);
      return row ? fromRow(row) : null;
    },
    // Curated works plus verified uploads: the pool blind comparisons draw from.
    eligible(taskId) {
      return [...catalog.works(taskId), ...q.worksOfTask.all(taskId).map(fromRow).filter(isEligible)];
    },
    uploads() {
      return q.works.all().map(fromRow);
    },
    uploadsOf(userId) {
      return q.worksOfOwner.all(userId).map(fromRow);
    },

    toPublic(work, viewer) {
      if (work.curated) return { task: work.taskId, id: work.id, curated: true, title: work.title, model: work.modelId, modelName: work.modelName, vendor: work.vendor, effort: work.effort, tool: work.tool, cover: work.cover, status: 'verified' };
      const privileged = viewer && (viewer.id === work.ownerId || viewer.role === 'admin');
      return {
        task: work.taskId,
        id: work.id,
        curated: false,
        title: work.title,
        summary: work.summary,
        model: work.modelId,
        modelName: work.modelName,
        vendor: work.vendor,
        effort: work.effort,
        tool: work.tool,
        note: work.note,
        status: work.status,
        reason: work.reason,
        owner: work.ownerName,
        mine: Boolean(viewer && viewer.id === work.ownerId),
        addedAt: iso(work.createdAt),
        reviewedAt: iso(work.reviewedAt),
        scene: `${originOf(work.contentKey)}/`,
        captures: Object.fromEntries(Object.entries(work.captures).map(([id, file]) => [id, `media/${work.id}/${file}`])),
        cover: work.cover ? `media/${work.id}/${work.cover}` : null,
        files: work.files,
        bytes: work.bytes,
        ...(privileged ? { checks: work.checks, trial: work.trial, sourceName: work.sourceName, root: work.root, entry: work.entry, reviewer: work.reviewerName } : {}),
      };
    },

    // ---- drafts: stage → trial load → submit --------------------------------------------
    createDraft(user, taskId, filename, buffer) {
      const task = catalog.task(taskId);
      if (!task) fail(404, '题目不存在');
      if (!task.acceptsUploads) fail(409, '这道题的提示词原文尚未公开，暂不接受上传');
      purgeDrafts();
      const inspected = inspectUpload(buffer, filename, { limits, cdn: config.cdn });
      const curatedTwin = catalog.duplicateOf(inspected.entryDigest);
      const uploadTwin = q.workByDigest.get(inspected.digest);
      if (curatedTwin) inspected.checks.push({ id: 'duplicate', state: 'warn', label: '重复检测', detail: `入口页面与馆藏作品「${curatedTwin.title}」（${curatedTwin.modelName}）完全相同，核验时会重点比对。` });
      else if (uploadTwin) inspected.checks.push({ id: 'duplicate', state: 'warn', label: '重复检测', detail: `与已上传的作品「${uploadTwin.title}」内容完全相同。` });
      else inspected.checks.push({ id: 'duplicate', state: 'ok', label: '重复检测', detail: '未发现与已有作品相同的内容' });

      // Keep only the newest drafts of each author.
      for (const { id } of q.draftsOf.all(user.id).slice(limits.draftsPerUser - 1)) {
        rmSync(join(dirs.drafts, id), { recursive: true, force: true });
        q.deleteDraft.run(id);
      }
      const id = randomBytes(10).toString('hex');
      writeTree(join(dirs.drafts, id), inspected.files);
      const now = Date.now();
      q.insertDraft.run(id, user.id, taskId, token('d'), clip(filename, 120) || 'upload', inspected.root, inspected.entry,
        inspected.count, inspected.bytes, inspected.digest, JSON.stringify(inspected.checks), now, now + limits.draftTtl);
      return publicDraft(q.draft.get(id));
    },

    draftByToken(key) {
      const row = q.draftByToken.get(key, Date.now());
      return row ? { ...row, dir: join(dirs.drafts, row.id, row.root) } : null;
    },

    discardDraft(user, id) {
      const row = q.draft.get(id);
      if (!row || row.owner_id !== user.id) fail(404, '试加载已结束');
      rmSync(join(dirs.drafts, id), { recursive: true, force: true });
      q.deleteDraft.run(id);
    },

    submit(user, body) {
      const draft = q.draft.get(String(body.draftId ?? ''));
      if (!draft || draft.owner_id !== user.id || draft.expires_at <= Date.now()) fail(404, '试加载已过期，请重新选择文件');
      if (body.confirmed !== true) fail(400, '请先确认作品在试加载中运行正常');
      const title = clip(body.title, 40);
      if (!title) fail(400, '请填写作品标题');
      const tool = clip(body.tool, 40);
      if (!tool) fail(400, '请填写生成工具');
      const who = identity(body);
      const cover = coverFrom(body.cover);
      if (q.pendingOf.get(user.id).n >= limits.pendingPerUser) fail(429, `你已有 ${limits.pendingPerUser} 件作品在等待核验，请等核验后再上传`);

      let id = workId();
      while (q.work.get(id)) id = workId();
      const now = Date.now();
      const staged = join(dirs.drafts, draft.id);
      const stored = join(dirs.works, id);
      renameSync(staged, stored);
      try {
        transaction(db, () => {
          q.insertWork.run(id, draft.task_id, user.id, title, clip(body.summary, 200), who.modelId, who.modelName, who.vendor,
            effortOf(body.effort), tool, clip(body.note, 1000), token('w'), draft.source_name, draft.root, draft.entry, draft.file_count,
            draft.bytes, draft.digest, draft.checks, JSON.stringify(sanitizeTrial(body.trial)), cover ? `cover.${cover.type.ext}` : null, now, now);
          q.deleteDraft.run(draft.id);
        });
      } catch (error) {
        renameSync(stored, staged);
        throw error;
      }
      if (cover) {
        mkdirSync(join(dirs.media, id), { recursive: true });
        writeFileSync(join(dirs.media, id, `cover.${cover.type.ext}`), cover.buffer);
      }
      const work = upload(draft.task_id, id);
      audit(user, 'submit', work, `${work.modelName}${work.effort ? ` · ${work.effort}` : ''}`);
      return work;
    },

    setCaptures(id, captures) {
      q.captures.run(JSON.stringify(captures), id);
    },

    // ---- review and removal -----------------------------------------------------------
    review(admin, taskId, id, body) {
      const work = upload(taskId, id);
      if (!work) fail(404, '作品不存在');
      const status = String(body.status ?? '');
      if (!['verified', 'questioned', 'unverified'].includes(status)) fail(400, '审核结果无效');
      const reason = clip(body.reason, 500);
      if (status === 'questioned' && !reason) fail(400, '标记存疑时请写明原因，作者和访客都会看到');
      const who = body.modelId !== undefined || body.modelName !== undefined ? identity(body) : work;
      const effort = body.effort !== undefined ? effortOf(body.effort) : work.effort;
      const now = Date.now();
      q.review.run(status, status === 'verified' ? '' : reason, who.modelId, who.modelName, who.vendor, effort, admin.id, now, now, id);
      const updated = upload(taskId, id);
      const labels = { verified: '通过验证', questioned: '标记存疑', unverified: '退回未验证' };
      audit(admin, status, updated, [labels[status], reason].filter(Boolean).join('：'));
      return updated;
    },

    remove(user, taskId, id) {
      if (catalog.work(taskId, id)) fail(409, '馆藏作品由仓库收录流程管理，需要在仓库中移除');
      const work = upload(taskId, id);
      if (!work) fail(404, '作品不存在');
      if (work.ownerId !== user.id && user.role !== 'admin') fail(403, '只能删除自己上传的作品');
      const now = Date.now();
      q.remove.run(now, user.id, now, id);
      rmSync(join(dirs.works, id), { recursive: true, force: true });
      rmSync(join(dirs.media, id), { recursive: true, force: true });
      audit(user, 'delete', work, user.id === work.ownerId ? '作者删除' : '管理员删除');
    },

    // ---- reactions -------------------------------------------------------------------------
    react(user, taskId, id, emoji) {
      const work = catalog.work(taskId, id) ?? upload(taskId, id);
      if (!work) fail(404, '作品不存在');
      if (!isInteractive(work)) fail(409, '存疑作品仅供参考，不能再互动');
      if (!EMOJIS.includes(emoji)) fail(400, '不支持这个表情');
      if (q.reaction.get(taskId, id, user.id, emoji)) q.dropReaction.run(taskId, id, user.id, emoji);
      else q.addReaction.run(taskId, id, user.id, emoji, Date.now());
      const mine = q.myReactions.all(user.id).filter((row) => row.task_id === taskId && row.work_id === id).map((row) => row.emoji);
      return { counts: reactionsOf(taskId, id), mine };
    },

    reactionSummary(user) {
      const counts = {};
      for (const row of q.reactionCounts.all()) (counts[`${row.task_id}/${row.work_id}`] ??= {})[row.emoji] = row.n;
      const mine = {};
      if (user) for (const row of q.myReactions.all(user.id)) (mine[`${row.task_id}/${row.work_id}`] ??= []).push(row.emoji);
      return { counts, mine };
    },

    pendingCount: (userId) => q.pendingOf.get(userId).n,
    auditLog(limit = 200) {
      return q.auditLog.all(limit).map((row) => ({ at: iso(row.at), actor: row.actor_name, action: row.action, task: row.task_id, work: row.work_id, detail: row.detail }));
    },
    hasDirectory: (id) => existsSync(join(dirs.works, id)),
  };
}
