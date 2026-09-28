// Admin web app for the shared backend: review queue, uploads and user roles.
// Zero dependencies; served from /admin/ by server/app.mjs. Talks to /api/* on the
// same origin, so the session cookie is the only credential.

// ---- helpers -----------------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
};
const pad = (n) => String(n).padStart(2, '0');
const formatDate = (value) => (value ? new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '');
const formatTime = (value) => (value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const formatBytes = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

const ICONS = {
  sun: '<circle cx="12" cy="12" r="3.6"/><path d="M12 3v1.8M12 19.2V21M5.64 5.64l1.27 1.27M17.09 17.09l1.27 1.27M3 12h1.8M19.2 12H21M5.64 18.36l1.27-1.27M17.09 6.91l1.27-1.27"/>',
  moon: '<path d="M19.5 14.6A7.5 7.5 0 0 1 9.4 4.5a7.5 7.5 0 1 0 10.1 10.1Z"/>',
  arrow: '<path d="M7.5 16.5 16.5 7.5M9 7.5h7.5V15"/>',
  close: '<path d="M17.5 6.5l-11 11M6.5 6.5l11 11"/>',
  guide: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.9v.01"/>',
  check: '<path d="m6 12.5 4 4 8-9"/>',
  alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.8v5M12 16.1v.01"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  shield: '<path d="M12 3.5 19 6v5.6c0 4.3-3 7.5-7 8.9-4-1.4-7-4.6-7-8.9V6z"/><path d="m9 12 2.2 2.2L15.3 10"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  logout: '<path d="M13.5 4.5h5v15h-5M9.5 8l-4 4 4 4M5.5 12h9"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5a7 7 0 0 1 14 0"/>',
  users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 19.5a6.5 6.5 0 0 1 13 0"/><path d="M16 5.6a3.5 3.5 0 0 1 0 5.8M17.5 13.6a6.5 6.5 0 0 1 4 5.9"/>',
  file: '<path d="M7 3.5h7l4.5 4.5v12.5h-11.5z"/><path d="M14 3.5V8h4.5"/>',
  reload: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.2h-4.2"/>',
  panel: '<path d="M4 4.5h16v15H4zM9 4.5v15"/>',
  chart: '<path d="M4 19.5h16M6 16v-5M11 16V7M16 16V4"/>',
  inbox: '<path d="M4 5h16v11l-3 3H7l-3-3zM4 14h5l1.5 2h3L15 14h5"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  game: '<path d="M7 8h10a4 4 0 0 1 3.8 3l1 5a2 2 0 0 1-3.3 1.8L16 16H8l-2.5 1.8A2 2 0 0 1 2.2 16l1-5A4 4 0 0 1 7 8ZM7 11v4M5 13h4M16 12h.01M18 14h.01"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15"/><path d="M3.5 9h17M8 3v4M16 3v4"/>',
};
const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
// Same mark as the gallery: a solid line (同) over a broken one (异).
const LOGO = '<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect class="logo-bg" width="32" height="32" rx="7"/><rect class="logo-fg" x="7" y="10" width="18" height="4"/><rect class="logo-fg" x="7" y="18" width="7.6" height="4"/><rect class="logo-ac" x="17.4" y="18" width="7.6" height="4"/></svg>';

// ---- theme -------------------------------------------------------------------------------
const THEME_COLOR = { light: '#dfe3dd', dark: '#121211' };
const currentTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
function applySystemTheme() {
  document.documentElement.dataset.system = state.system;
  document.documentElement.dataset.theme = store.get(`admin-theme-${state.system}`)
    || (state.system === 'gallery' ? store.get('admin-theme') || 'dark' : 'light');
  syncThemeUi();
}
function syncThemeUi() {
  const theme = currentTheme();
  $('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  $$('[data-theme-toggle]').forEach((b) => {
    b.setAttribute('aria-pressed', String(theme === 'dark'));
    b.title = theme === 'dark' ? '切换到纸面（浅色）' : '切换到墨色（深色）';
  });
}
function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  store.set(`admin-theme-${state.system}`, next);
  if (state.system === 'gallery') store.set('admin-theme', next);
  document.documentElement.dataset.theme = next;
  syncThemeUi();
}
const themeButton = () => `<button class="icon-btn theme-toggle" data-theme-toggle aria-label="切换主题" aria-pressed="${currentTheme() === 'dark'}">${icon('moon')}${icon('sun')}</button>`;

// ---- api -----------------------------------------------------------------------------------
class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`/api/${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, '网络连接失败，请稍后再试');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error ?? `请求失败（${response.status}）`, data.code);
  if (method !== 'GET') state.workCache.clear();
  return data;
}

// ---- toast and dialogs --------------------------------------------------------------------
let toastTimer = 0;
function toast(message) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function openDialog({ title, body, className = '', onClose }) {
  const dialog = document.createElement('dialog');
  dialog.className = `sheet ${className}`;
  dialog.innerHTML = `<div class="sheet-in">
    <header class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" type="button" data-sheet-close aria-label="关闭">${icon('close')}</button></header>
    <div class="sheet-body">${body}</div>
  </div>`;
  document.body.append(dialog);
  const close = () => { if (dialog.open) dialog.close(); };
  dialog.addEventListener('close', () => { dialog.remove(); onClose?.(); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog || e.target.closest('[data-sheet-close]')) close(); });
  dialog.showModal();
  return { el: dialog, close, setTitle: (text) => { $('.sheet-head h2', dialog).textContent = text; } };
}

function confirmDialog({ title, message, confirm = '确认', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    const sheet = openDialog({
      title,
      className: 'confirm-sheet',
      body: `<p class="sheet-text">${esc(message)}</p><div class="sheet-actions"><button class="btn" type="button" data-sheet-close>取消</button><button class="btn primary${danger ? ' danger' : ''}" type="button" data-confirm>${esc(confirm)}</button></div>`,
      onClose: () => resolve(answer),
    });
    $('[data-confirm]', sheet.el).addEventListener('click', () => { answer = true; sheet.close(); });
  });
}

// ---- shared bits ---------------------------------------------------------------------------
const STATUS = {
  verified: { label: '已验证', hint: '已核验，参与盲评并优先展示', icon: 'check' },
  unverified: { label: '未验证', hint: '等待核验：可以浏览和贴表情，暂不参与盲评', icon: 'clock' },
  questioned: { label: '存疑', hint: '核验存疑：仅供参考，不参与互动与盲评', icon: 'alert' },
};
const statusBadge = (status, reason = '') => {
  const info = STATUS[status];
  return info ? `<span class="status status-${status}" title="${esc(reason || info.hint)}">${icon(info.icon)}${info.label}</span>` : '';
};
const ACTIONS = { submit: '提交作品', verified: '通过验证', questioned: '标记存疑', unverified: '退回未验证', delete: '删除作品', role: '调整角色' };
const REVIEW_TABS = { unverified: '未验证', verified: '已验证', questioned: '存疑', log: '记录' };
const skeleton = (count = 4, kind = 'row') => `<div class="skeleton-list" aria-label="正在载入" role="status">${Array.from({ length: count }, () => `<div class="skeleton skeleton-${kind}"></div>`).join('')}</div>`;
function busy(button, text = '处理中…') {
  if (!button) return () => {};
  const original = button.innerHTML;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.innerHTML = `<span class="busy-spinner" aria-hidden="true"></span>${text}`;
  return () => { if (button.isConnected) { button.innerHTML = original; button.disabled = false; button.removeAttribute('aria-busy'); } };
}

// App state. `data` is the static catalog (task titles, model list) read from /data.json.
const state = { user: undefined, data: null, works: null, audit: [], users: null, worksFilter: 'all', error: '',
  system: store.get('admin-system') === 'arena' ? 'arena' : 'gallery', adminWorks: [], workTotal: 0,
  workCache: new Map(), workKey: '', workLoading: false, trafficLoading: false, requestId: 0,
  sidebarCollapsed: store.get('admin-sidebar-collapsed') === '1',
  workPage: 1, workTask: '', workStatus: '', workShow: '', workSearch: '', traffic: null };
const taskTitle = (id) => [...(state.data?.tasks ?? []), ...(state.questions ?? [])].find((t) => t.id === id)?.title ?? id;

async function loadCatalog() {
  if (state.data) return;
  try {
    const response = await fetch('/data.json', { cache: 'no-store' });
    state.data = response.ok ? await response.json() : { tasks: [], models: [] };
  } catch {
    state.data = { tasks: [], models: [] };
  }
}

async function loadReview() {
  const data = await api('review');
  state.works = data.works;
  state.audit = data.audit;
}

async function removeWork(w) {
  const ok = await confirmDialog({
    title: '删除这件作品？',
    message: `「${w.title}」的文件会被永久删除，展厅中不再显示。${w.status === 'verified' ? '它参与过的盲评投票会从榜单中移出。' : ''}操作会记入审核记录。`,
    confirm: '删除',
    danger: true,
  });
  if (!ok) return false;
  toast('正在删除作品…');
  try {
    await api(`works/${encodeURIComponent(w.task)}/${encodeURIComponent(w.id)}`, { method: 'DELETE' });
    toast('作品已删除');
    return true;
  } catch (error) {
    toast(error.message);
    return false;
  }
}

// Quick "mark as questioned" with a mandatory reason, used by the works table.
function questionWork(w) {
  return new Promise((resolve) => {
    let done = false;
    const sheet = openDialog({
      title: `标记存疑：${w.title}`,
      className: 'confirm-sheet',
      onClose: () => resolve(done),
      body: `<form class="question-form" novalidate>
        <label class="field"><span class="field-label">存疑原因<small>必填，作者与访客都能看到</small></span><textarea class="input" name="reason" rows="3" maxlength="500" required>${esc(w.status === 'questioned' ? w.reason : '')}</textarea></label>
        <p class="form-error" role="alert"></p>
        <div class="sheet-actions"><button class="btn" type="button" data-sheet-close>取消</button><button class="btn primary danger" type="submit">${icon('alert')}标记存疑</button></div>
      </form>`,
    });
    const form = $('form', sheet.el);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const reason = form.reason.value.trim();
      if (!reason) { $('.form-error', form).textContent = '请写明存疑原因'; return; }
      const doneBusy = busy($('[type="submit"]', form), '正在保存…');
      try {
        await api(`works/${encodeURIComponent(w.task)}/${encodeURIComponent(w.id)}/review`, { method: 'POST', body: { status: 'questioned', reason } });
        done = true;
        sheet.close();
        toast(`已标记存疑：${w.title}`);
      } catch (error) {
        $('.form-error', form).textContent = error.message;
        doneBusy();
      }
    });
    setTimeout(() => form.reason.focus());
  });
}

// ---- work rows ------------------------------------------------------------------------------
function thumb(w) {
  const src = Object.values(w.captures ?? {})[0] ?? w.cover;
  const url = src ? (src.startsWith('http') ? src : `/${src}`) : '';
  return `<span class="work-thumb" aria-hidden="true">${url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">` : `<span class="img-empty upload-cover"><b>${esc(w.title)}</b></span>`}</span>`;
}

function workRow(w) {
  return `<article class="work-row" data-status="${esc(w.status)}">
    ${thumb(w)}
    <div class="work-main">
      <p class="work-model"><b>${esc(w.modelName)}</b>${w.effort ? `<span class="badge">${esc(w.effort)}</span>` : ''}${statusBadge(w.status, w.reason)}${w.audience === 'hidden' ? '<span class="badge">未公开迁入</span>' : ''}</p>
      <h3>${esc(w.title)}</h3>
      <p class="work-meta">${esc(taskTitle(w.task))} · ${esc(w.tool)} · ${formatDate(w.addedAt)} · 投稿者 ${esc(w.owner ?? '已注销的用户')}</p>
      ${w.reason ? `<p class="work-reason">${icon('alert')}<span>${esc(w.reason)}</span></p>` : ''}
    </div>
    <div class="work-side">
      <div class="actions">
        <a class="btn sm" href="${esc(w.scene)}" target="_blank" rel="noopener">打开${icon('arrow')}</a>
        <button class="btn sm primary" data-review="${esc(w.id)}">审核</button>
        <button class="icon-btn" data-delete="${esc(w.id)}" title="删除作品" aria-label="删除「${esc(w.title)}」">${icon('trash')}</button>
      </div>
    </div>
  </article>`;
}

// ---- review sheet ----------------------------------------------------------------------------
function trialRows(trial) {
  if (!trial || trial.loaded === undefined) return '<li class="check is-info"><span><b>试加载</b>没有记录</span></li>';
  const rows = [
    trial.loaded ? ['ok', '页面载入', `${((trial.loadMs ?? 0) / 1000).toFixed(1)} 秒`] : ['fail', '页面载入', '作者提交时页面未完成载入'],
    trial.errors ? ['warn', '脚本错误', `${trial.errors} 条：${trial.errorSamples?.[0] ?? ''}`] : ['ok', '脚本错误', '没有'],
    trial.failedResources?.length ? ['warn', '资源加载', trial.failedResources.join('、')] : ['ok', '资源加载', '全部载入'],
    trial.blocked?.length ? ['warn', '外部请求', `被拦截：${trial.blocked.join('、')}`] : ['ok', '外部请求', '没有被拦截的请求'],
    trial.canvases || trial.media || trial.words > 20 ? ['ok', '画面内容', trial.canvases ? `${trial.canvases} 个画布` : '有可见内容'] : ['warn', '画面内容', '可能是空白页面'],
  ];
  return rows.map(([st, label, detail]) => `<li class="check is-${st}">${icon(st === 'ok' ? 'check' : st === 'fail' ? 'close' : 'alert')}<span><b>${esc(label)}</b>${esc(detail)}</span></li>`).join('');
}

function openReview(w) {
  const vendors = new Map();
  for (const model of state.data?.models ?? []) {
    if (!vendors.has(model.vendor)) vendors.set(model.vendor, []);
    vendors.get(model.vendor).push(model);
  }
  const options = [...vendors].sort(([a], [b]) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
    .map(([vendor, models]) => `<optgroup label="${esc(vendor)}">${models.map((m) => `<option value="${esc(m.id)}"${m.id === w.model ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</optgroup>`).join('');
  const sheet = openDialog({
    title: '核验作品',
    className: 'review-sheet',
    body: `<div class="review">
      <div class="review-facts">
        <div class="review-head">${thumb(w)}<div><h3>${esc(w.title)}</h3><p class="work-model">${statusBadge(w.status)}<span>${esc(taskTitle(w.task))}</span></p>
          <div class="actions"><a class="btn sm" href="${esc(w.scene)}" target="_blank" rel="noopener">在新窗口打开${icon('arrow')}</a></div></div></div>
        <dl class="facts">
          <div><dt>投稿者</dt><dd>${esc(w.owner ?? '已注销的用户')} · ${formatTime(w.addedAt)}</dd></div>
          <div><dt>声明的模型</dt><dd>${esc(w.modelName)}${w.vendor ? ` · ${esc(w.vendor)}` : ''}${w.model ? '' : '（未登记）'}</dd></div>
          <div><dt>推理档位</dt><dd>${esc(w.effort || '默认 / 未设置')}</dd></div>
          <div><dt>生成工具</dt><dd>${esc(w.tool)}</dd></div>
          <div><dt>文件</dt><dd>${esc(w.sourceName ?? '')} · ${w.files} 个 · ${formatBytes(w.bytes)} · 入口 ${esc(w.root ? `${w.root}/` : '')}${esc(w.entry ?? '')}</dd></div>
          ${w.reviewer ? `<div><dt>上次核验</dt><dd>${esc(w.reviewer)} · ${formatTime(w.reviewedAt)}</dd></div>` : ''}
        </dl>
        ${w.summary ? `<p class="review-text">${esc(w.summary)}</p>` : ''}
        <h4>生成说明</h4><p class="review-text">${w.note ? esc(w.note) : '<span class="muted">投稿者没有填写。</span>'}</p>
        <h4>上传检查</h4><ul class="checks">${(w.checks ?? []).map((c) => `<li class="check is-${c.state}">${icon(c.state === 'ok' ? 'check' : c.state === 'info' ? 'guide' : 'alert')}<span><b>${esc(c.label)}</b>${esc(c.detail)}</span></li>`).join('')}</ul>
        <h4>作者浏览器中的试加载</h4><ul class="checks">${trialRows(w.trial)}</ul>
        <h4>试加载</h4><div class="trial-live"><iframe src="${esc(w.scene)}" title="试加载「${esc(w.title)}」" loading="lazy"></iframe></div>
      </div>
      <form class="review-form" novalidate>
        <h4>核验清单</h4>
        <ul class="review-list">
          <li><label><input type="checkbox">作品能正常运行，内容符合本题提示词</label></li>
          <li><label><input type="checkbox">模型与档位有可信依据（生成说明、记录链接）</label></li>
          <li><label><input type="checkbox">画面中没有写出模型名称，不会破坏双盲</label></li>
          <li><label><input type="checkbox">没有外部追踪、恶意代码或不当内容</label></li>
        </ul>
        <p class="fine">清单只是提醒，不会随结果保存。</p>
        <div class="field-row">
          <label class="field"><span class="field-label">登记为模型</span><select class="input" name="modelId"><option value="">保持声明：${esc(w.modelName)}</option>${options}</select></label>
          <label class="field"><span class="field-label">推理档位</span><input class="input" name="effort" maxlength="20" value="${esc(w.effort)}" placeholder="默认 / 未设置"></label>
        </div>
        <label class="field"><span class="field-label">作品标题</span><input class="input" name="title" maxlength="40" value="${esc(w.title)}" required></label>
        <label class="field"><span class="field-label">模型名称</span><input class="input" name="modelName" maxlength="60" value="${esc(w.modelName)}" required></label>
        <label class="field"><span class="field-label">作品摘要</span><textarea class="input" name="summary" maxlength="200" rows="2">${esc(w.summary)}</textarea></label>
        <div class="face-checks"><label><input type="checkbox" name="show_gallery" ${w.status === 'unverified' || ['show2', 'both'].includes(w.audience) ? 'checked' : ''}> 展览馆显示</label><label><input type="checkbox" name="show_arena" ${w.show_arena ? 'checked' : ''}> 竞技场显示<small>默认关闭，手动开启才进配对池</small></label></div>
        <label class="field"><span class="field-label">说明<small>标记存疑时必填，作者与访客都能看到</small></span><textarea class="input" name="reason" rows="3" maxlength="500">${esc(w.status === 'questioned' ? w.reason : '')}</textarea></label>
        <p class="form-error" role="alert"></p>
        <div class="sheet-actions">
          <button type="button" class="btn danger ghost" data-remove>${icon('trash')}删除</button>
          <span class="spacer"></span>
          ${w.status !== 'unverified' ? '<button type="button" class="btn ghost" data-decide="unverified">退回未验证</button>' : ''}
          <button type="button" class="btn" data-decide="questioned">${icon('alert')}标记存疑</button>
          <button type="button" class="btn primary" data-decide="verified">${icon('check')}通过验证</button>
        </div>
      </form>
    </div>`,
  });
  const form = $('form', sheet.el);
  sheet.el.addEventListener('click', async (e) => {
    const decide = e.target.closest('[data-decide]');
    if (e.target.closest('[data-remove]')) {
      sheet.close();
      if (await removeWork(w)) await reload();
      return;
    }
    if (!decide) return;
    const field = (name) => form.elements.namedItem(name);
    const body = { status: decide.dataset.decide, reason: field('reason').value, effort: field('effort').value,
      title: field('title').value, summary: field('summary').value,
      show_gallery: field('show_gallery').checked, show_arena: field('show_arena').checked };
    if (field('modelId').value) body.modelId = field('modelId').value;
    else if (field('modelName').value !== w.modelName) body.modelName = field('modelName').value;
    $$('[data-decide]', form).forEach((b) => { b.disabled = true; });
    const doneBusy = busy(decide, '正在保存…');
    try {
      await api(`works/${encodeURIComponent(w.task)}/${encodeURIComponent(w.id)}/review`, { method: 'POST', body });
      sheet.close();
      toast(`已${{ verified: '通过验证', questioned: '标记存疑', unverified: '退回未验证' }[body.status]}：${w.title}`);
      await reload();
    } catch (error) {
      $('.form-error', form).textContent = error.message;
      doneBusy();
      $$('[data-decide]', form).forEach((b) => { b.disabled = false; });
    }
  });
}

// ---- views -----------------------------------------------------------------------------------
const app = () => $('#app');
const routeParts = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
const TABS = [
  { id: 'review', label: '审核', icon: 'shield' },
  { id: 'works', label: '作品', icon: 'file' },
  { id: 'tasks', label: '题目', icon: 'guide' },
  { id: 'users', label: '用户', icon: 'users' },
  { id: 'traffic', label: '流量', icon: 'clock' },
];
const ARENA_NAV = [
  ['总览', [['traffic', '仪表盘', 'chart', '#/traffic'], ['flow', '数据流水', 'list', '#/review/log']]],
  ['内容管理', [['works', '作品管理', 'file', '#/works'], ['tasks', '题目管理', 'guide', '#/tasks'], ['review', '收件箱', 'inbox', '#/review'], ['users', '用户管理', 'users', '#/users']]],
  ['玩法', [['guess', '模一把', 'game', '#/guess'], ['activity', '活动管理', 'calendar', '#/activity']]],
];
const systemSwitch = () => `<div class="system-switch" role="group" aria-label="管理系统"><button type="button" data-system="gallery" aria-pressed="${state.system === 'gallery'}">展览馆系统</button><button type="button" data-system="arena" aria-pressed="${state.system === 'arena'}">竞技场系统</button></div>`;

function topbar(route) {
  if (state.system === 'arena') return `<header class="topbar arena-topbar">
    <div class="arena-page-mark"><span class="eyebrow">偏见试验场 / 管理工作台</span><strong>${esc(route === 'review' && routeParts()[1] === 'log' ? '数据流水' : route === 'traffic' ? '仪表盘' : route === 'guess' ? '模一把' : route === 'activity' ? '活动管理' : TABS.find((tab) => tab.id === route)?.label ?? '管理后台')}</strong></div>
    <span class="topbar-space"></span>${systemSwitch()}${themeButton()}
    <span class="user-chip" title="当前账号"><span class="avatar" aria-hidden="true">${esc(state.user.name.slice(0, 1).toUpperCase())}</span><span class="user-name">${esc(state.user.name)}</span></span>
    <button class="icon-btn" data-logout title="退出登录" aria-label="退出登录">${icon('logout')}</button>
  </header>`;
  return `<header class="topbar">
    <a class="brand" href="#/review">${LOGO}<span class="brand-name">同题异答<b>管理后台</b></span></a>
    ${systemSwitch()}
    <nav class="tabs" aria-label="管理">
      ${TABS.map((tab) => `<a href="#/${tab.id}"${tab.id === route ? ' aria-current="page"' : ''}>${icon(tab.icon)}${tab.label}</a>`).join('')}
    </nav>
    <span class="topbar-space"></span>
    ${themeButton()}
    <span class="user-chip" title="当前账号"><span class="avatar" aria-hidden="true">${esc(state.user.name.slice(0, 1).toUpperCase())}</span><span class="user-name">${esc(state.user.name)}</span></span>
    <button class="icon-btn" data-logout title="退出登录" aria-label="退出登录">${icon('logout')}</button>
  </header>`;
}
function arenaSidebar(route, sub) {
  const selected = route === 'review' && sub === 'log' ? 'flow' : route;
  return `<aside class="workspace-sidebar" aria-label="竞技场工作台导航">
    <div class="sidebar-head"><a class="sidebar-brand" href="#/traffic">${LOGO}<span class="sidebar-copy"><b>偏见试验场</b><small>竞技场管理工作台</small></span></a>
      <button class="icon-btn sidebar-collapse" type="button" data-sidebar-collapse aria-label="${state.sidebarCollapsed ? '展开侧栏' : '折叠侧栏'}" aria-expanded="${!state.sidebarCollapsed}" title="${state.sidebarCollapsed ? '展开侧栏' : '折叠侧栏'}">${icon('panel')}</button></div>
    <nav class="sidebar-nav">${ARENA_NAV.map(([group, items]) => `<div class="sidebar-group"><span class="sidebar-caption">${group}</span>${items.map(([id, label, glyph, href]) => `<a href="${href}" title="${label}" ${selected === id ? 'aria-current="page"' : ''}>${icon(glyph)}<span class="sidebar-label">${label}</span>${id === 'review' && state.works ? `<i>${state.works.filter((w) => w.status === 'unverified').length}</i>` : ''}</a>`).join('')}</div>`).join('')}</nav>
    <div class="sidebar-foot"><span>共享数据 · 双系统门面</span><small>竞技场 / 管理后台</small></div>
  </aside>`;
}

function pageHero(kicker, title, lead, stats) {
  return `<section class="page-hero">
    <p class="eyebrow"><span class="eyebrow-mark" aria-hidden="true"></span>${esc(kicker)}</p>
    <h1>${esc(title)}<span class="stop">。</span></h1>
    <div class="hero-foot">
      <p class="lead">${esc(lead)}</p>
      <dl class="stats">${stats.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${typeof value === 'number' ? pad(value) : esc(value)}</dd></div>`).join('')}</dl>
    </div>
  </section>`;
}

// -- review tab --
function reviewView(sub) {
  const tab = Object.hasOwn(REVIEW_TABS, sub ?? '') ? sub : 'unverified';
  const works = state.works ?? [];
  const count = (status) => works.filter((w) => w.status === status).length;
  const titles = new Map(works.map((w) => [w.id, w.title]));
  let list;
  if (tab === 'log') {
    list = state.audit.length
      ? `<ol class="audit">${state.audit.map((row) => `<li><time>${formatTime(row.at)}</time><span class="audit-actor">${esc(row.actor)}</span><b>${esc(ACTIONS[row.action] ?? row.action)}</b><span class="audit-work">${row.work ? esc(titles.get(row.work) ?? `${row.work}（已删除）`) : ''}${row.detail ? ` · ${esc(row.detail)}` : ''}</span></li>`).join('')}</ol>`
      : '<p class="muted">还没有记录。</p>';
  } else {
    const rows = works.filter((w) => w.status === tab).sort((a, b) => (tab === 'unverified' ? Date.parse(a.addedAt) - Date.parse(b.addedAt) : Date.parse(b.addedAt) - Date.parse(a.addedAt)));
    list = rows.length
      ? `<div class="work-list">${rows.map(workRow).join('')}</div>`
      : `<div class="board-empty"><p class="board-empty-title">${tab === 'unverified' ? '没有等待核验的作品' : `没有${REVIEW_TABS[tab]}的投稿`}</p><p>${tab === 'unverified' ? '新的投稿会按提交顺序出现在这里。' : '馆藏作品由仓库收录流程管理，不在这里审核。'}</p></div>`;
  }
  return `${pageHero('审核管理', '审核', '核对每件投稿能否运行、是否符合题目、生成信息是否可信。通过的作品进入盲评并优先展示；无法核实的标记存疑并写明原因。', [['待核验', count('unverified')], ['已验证', count('verified')], ['存疑', count('questioned')]])}
  <section class="block">
    <div class="actions admin-toolbar"><button class="btn primary" type="button" data-admin-upload>代传作品</button></div>
    <nav class="seg review-tabs" aria-label="审核分类">${Object.entries(REVIEW_TABS).map(([id, text]) => `<a href="#/review/${id}"${id === tab ? ' aria-current="page"' : ''}>${text}${id === 'log' ? '' : `<span>${count(id)}</span>`}</a>`).join('')}</nav>
    ${state.works === null ? skeleton(5) : list}
  </section>`;
}

// -- works tab --
const WORKS_FILTERS = { all: '全部', unverified: '未验证', verified: '已验证', questioned: '存疑' };
function worksView() {
  const works = state.works ?? [];
  const filter = state.worksFilter;
  const rows = works.filter((w) => filter === 'all' || w.status === filter);
  const table = rows.length
    ? `<div class="table-wrap"><table class="board works-table">
        <thead><tr><th class="c-title">作品</th><th>模型</th><th>档位</th><th>状态</th><th>投稿者</th><th>提交时间</th><th class="c-actions">操作</th></tr></thead>
        <tbody>${rows.map((w) => `<tr data-status="${esc(w.status)}">
          <td class="c-title"><b>${esc(w.title)}</b><small>${esc(taskTitle(w.task))}</small></td>
          <td>${esc(w.modelName)}</td>
          <td>${esc(w.effort || '—')}</td>
          <td>${statusBadge(w.status, w.reason)}</td>
          <td>${esc(w.owner ?? '已注销')}</td>
          <td><time>${formatTime(w.addedAt)}</time></td>
          <td class="c-actions"><div class="actions">
            <button class="btn sm" data-review="${esc(w.id)}">审核</button>
            ${w.status !== 'verified' && w.audience !== 'hidden' ? `<button class="btn sm primary" data-verify="${esc(w.id)}" title="通过验证">${icon('check')}通过</button>` : ''}
            ${w.status !== 'questioned' ? `<button class="btn sm" data-question="${esc(w.id)}" title="标记存疑">${icon('alert')}存疑</button>` : ''}
            <button class="icon-btn" data-delete="${esc(w.id)}" title="删除作品" aria-label="删除「${esc(w.title)}」">${icon('trash')}</button>
          </div></td>
        </tr>`).join('')}</tbody>
      </table></div>`
    : `<div class="board-empty"><p class="board-empty-title">没有${filter === 'all' ? '' : WORKS_FILTERS[filter]}投稿</p><p>投稿作品会显示在这里；馆藏作品由仓库收录流程管理。</p></div>`;
  return `${pageHero('Works', '作品', '所有投稿作品的全景：按状态筛选，行内直接通过、存疑或删除。', [['投稿', works.length], ['待核验', works.filter((w) => w.status === 'unverified').length], ['已验证', works.filter((w) => w.status === 'verified').length]])}
  <section class="block">
    <div class="seg works-filter" role="group" aria-label="按状态筛选">${Object.entries(WORKS_FILTERS).map(([id, text]) => `<button type="button" data-filter="${id}" aria-pressed="${id === filter}">${text}</button>`).join('')}</div>
    ${state.works === null ? '<p class="muted">正在载入…</p>' : table}
  </section>`;
}

const faceLabel = () => state.system === 'gallery' ? '展览馆' : '竞技场';
const workKey = (w) => `${encodeURIComponent(w.task)}/${encodeURIComponent(w.id)}`;
function adminWorkRow(w, face = state.system) {
  const label = face === 'gallery' ? '展览馆' : '竞技场';
  return `<tr data-work-key="${esc(`${w.task}/${w.id}`)}">
    <td><div class="admin-work-title">${thumb(w)}<div><b>${esc(w.title)}</b><small>${esc(taskTitle(w.task))}</small></div></div></td>
    <td>${esc(w.modelName)}</td><td>${w.source === 'curated' ? '精选' : '投稿'}</td><td>${statusBadge(w.status)}</td>
    <td><label class="face-toggle"><input type="checkbox" data-face-toggle="${esc(w.id)}" ${w[`show_${face}`] ? 'checked' : ''} aria-label="${esc(w.title)}在${label}显示">${w[`show_${face}`] ? '已开启' : '已关闭'}</label></td>
    ${face === 'arena' ? `<td>${w.status === 'verified' && w.show_arena ? '在配对池' : '不在配对池'}</td>` : '<td>—</td>'}
    <td><div class="actions"><button class="btn sm" data-calibrate="${esc(w.id)}">${label}取景</button><button class="btn sm" data-task-note="${esc(w.task)}">${face === 'gallery' ? '策展笔记' : '题目点评'}</button>${w.source === 'upload' ? `<button class="btn sm" data-review="${esc(w.id)}">审核</button>` : ''}</div></td>
  </tr>`;
}
function systemWorksView() {
  const face = state.system;
  const works = state.adminWorks;
  const tasks = [...(state.data?.tasks ?? []), ...(state.questions ?? [])];
  const options = tasks.map((t) => `<option value="${esc(t.id)}" ${state.workTask === t.id ? 'selected' : ''}>${esc(t.title)}</option>`).join('');
  const pages = Math.max(1, Math.ceil(state.workTotal / 30));
  const rows = works.map((w) => adminWorkRow(w, face)).join('');
  return `${pageHero('作品管理', `${faceLabel()}作品`, '精选与投稿共用作品库，开关和取景分别保存。', [['全部作品', state.workTotal], ['本页', works.length]])}
    <section class="block"><form id="admin-work-filter" class="admin-filter">
      <input class="input" name="search" value="${esc(state.workSearch)}" placeholder="搜索作品或模型" aria-label="搜索作品或模型">
      <select class="input" name="task" aria-label="筛选题目"><option value="">全部题目</option>${options}</select>
      <select class="input" name="status" aria-label="筛选状态"><option value="">全部状态</option>${Object.entries(WORKS_FILTERS).filter(([id]) => id !== 'all').map(([id, label]) => `<option value="${id}" ${state.workStatus === id ? 'selected' : ''}>${label}</option>`).join('')}</select>
      <select class="input" name="show" aria-label="筛选开关"><option value="">全部开关</option><option value="on" ${state.workShow === 'on' ? 'selected' : ''}>已开启</option><option value="off" ${state.workShow === 'off' ? 'selected' : ''}>已关闭</option></select>
      <button class="btn" type="submit">筛选</button></form>
      <div class="work-results" aria-busy="${state.workLoading}">${state.workLoading ? skeleton(7) : rows ? `<div class="table-wrap"><table class="board admin-work-table"><thead><tr><th>作品</th><th>模型</th><th>来源</th><th>状态</th><th>${faceLabel()}开关</th><th>${face === 'arena' ? '配对池' : '备注'}</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="board-empty">没有符合条件的作品。</p>'}</div>
      <div class="admin-pagination"><button class="btn sm" data-page="${state.workPage - 1}" ${state.workPage <= 1 ? 'disabled' : ''}>上一页</button><span>第 ${state.workPage} / ${pages} 页</span><button class="btn sm" data-page="${state.workPage + 1}" ${state.workPage >= pages ? 'disabled' : ''}>下一页</button></div>
    </section>`;
}

function tasksView() {
  const tasks = [...(state.data?.tasks ?? []), ...(state.questions ?? [])];
  return `${pageHero('题目管理', `${faceLabel()}题目`, state.system === 'gallery' ? '为每道题编辑策展文案。' : '为每道题编辑点评和六维权重。', [['题目', tasks.length]])}
    <section class="block"><div class="admin-task-list">${tasks.map((task) => `<article class="admin-task"><div><h3>${esc(task.title)}</h3><p class="muted">${esc(task.id)}</p></div><button class="btn" data-task-note="${esc(task.id)}">${state.system === 'gallery' ? '编辑策展文案' : '编辑点评与权重'}</button></article>`).join('')}</div></section>`;
}

function trafficView() {
  const data = state.traffic;
  if (!data) return `${pageHero('访问概况', '流量', '近 30 日页面浏览和注册概况。', [['用户总数', '—'], ['新增用户', '—']])}<section class="block" aria-busy="true"><h2>每日访问</h2><div class="traffic-skeleton">${skeleton(16, 'bar')}</div><h2>热门路径</h2>${skeleton(5)}</section>`;
  const max = Math.max(1, ...data.daily.map((d) => d.pv));
  return `${pageHero('访问概况', '流量', '近 30 日页面浏览和注册概况。', [['用户总数', data.users.total], ['新增用户', data.users.new]])}
    <section class="block"><h2>每日访问</h2><div class="traffic-bars" aria-label="每日访问量">${data.daily.map((d) => `<div class="traffic-day" title="${d.day}：${d.pv} PV，${d.uniqueIps} 位独立访客"><div class="traffic-bar" style="height:${Math.max(2, d.pv / max * 100)}%"></div><span>${d.day.slice(5)}</span></div>`).join('')}</div>
    <h2>热门路径</h2><ol class="traffic-paths">${data.paths.map((p) => `<li><span>${esc(p.path)}</span><b>${p.pv} PV</b></li>`).join('') || '<li>暂无记录</li>'}</ol></section>`;
}
function placeholderView(route) {
  const title = route === 'guess' ? '模一把' : '活动管理';
  return `${pageHero('玩法 / 即将开放', title, '工作台入口已就位，功能建设中。', [])}<section class="block placeholder-module"><div class="placeholder-symbol">${icon(route === 'guess' ? 'game' : 'calendar')}</div><p class="eyebrow">玩法模块 / ${route === 'guess' ? '01' : '02'}</p><h2>功能建设中</h2><p>这里会接入「${title}」的管理工具。现有作品、题目与审核功能可继续使用。</p><a class="btn" href="#/works">返回作品管理 ${icon('arrow')}</a></section>`;
}

function calibrationDialog(w) {
  const face = state.system;
  const current = w[`calibration_${face}`] ?? {};
  const framing = current.framing ?? { width: 1440, height: 900, zoom: 1, offsetX: 0, offsetY: 0 };
  const camera = current.camera ?? { position: [0, 0, 5], target: [0, 0, 0] };
  const fields = [['width', 320, 3840, 1], ['height', 240, 3840, 1], ['zoom', 0.25, 4, 0.01], ['offsetX', -1, 1, 0.01], ['offsetY', -1, 1, 0.01]];
  const names = { width: '画框宽度', height: '画框高度', zoom: '缩放', offsetX: '水平偏移', offsetY: '垂直偏移',
    position0: '相机位置 X', position1: '相机位置 Y', position2: '相机位置 Z', target0: '相机目标 X', target1: '相机目标 Y', target2: '相机目标 Z' };
  const input = (name, value, min, max, step) => `<label class="field"><span class="field-label">${names[name]}</span><input class="input" type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="${step}" required></label>`;
  const sheet = openDialog({ title: `${faceLabel()}取景 · ${w.title}`, body: `<form class="admin-editor">
    <label class="field"><input type="checkbox" name="framing_enabled" ${current.framing ? 'checked' : ''}> 使用画框参数</label><div class="admin-grid">${fields.map(([name, min, max, step]) => input(name, framing[name], min, max, step)).join('')}</div>
    <label class="field"><input type="checkbox" name="camera_enabled" ${current.camera ? 'checked' : ''}> 使用相机参数</label><div class="admin-grid">${['position', 'target'].flatMap((key) => [0, 1, 2].map((i) => input(`${key}${i}`, camera[key][i], -9999999, 9999999, 'any'))).join('')}</div>
    <p class="form-error" role="alert"></p><div class="actions"><button class="btn primary" type="submit">保存取景</button><button class="btn" type="button" data-clear-calibration>清空取景</button></div></form>` });
  const form = $('form', sheet.el);
  const save = async (calibration) => {
    const done = busy($('button[type="submit"]', form), '正在保存…');
    $('[data-clear-calibration]', form).disabled = true;
    try { await api(`admin/works/${workKey(w)}/calibration`, { method: 'POST', body: { face, calibration } }); sheet.close(); toast('取景已保存'); await reload(); }
    catch (error) { $('.form-error', form).textContent = error.message; done(); $('[data-clear-calibration]', form).disabled = false; }
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = (name) => Number(form.elements.namedItem(name).value);
    const patch = { framing: form.elements.namedItem('framing_enabled').checked ? Object.fromEntries(fields.map(([name]) => [name, val(name)])) : null,
      camera: form.elements.namedItem('camera_enabled').checked ? { position: [0, 1, 2].map((i) => val(`position${i}`)), target: [0, 1, 2].map((i) => val(`target${i}`)) } : null };
    save(patch);
  });
  $('[data-clear-calibration]', sheet.el).addEventListener('click', () => save(null));
}

async function editorialDialog(taskId) {
  const face = state.system;
  const label = face === 'gallery' ? '展览馆' : '竞技场';
  const sheet = openDialog({ title: `${label}主编视角 · ${taskTitle(taskId)}`, body: skeleton(4) });
  let current;
  try { current = await api(`admin/tasks/${encodeURIComponent(taskId)}/editorial?face=${face}`); }
  catch (error) { if (sheet.el.isConnected) $('.sheet-body', sheet.el).innerHTML = `<p class="form-error" role="alert">${esc(error.message)}</p>`; return; }
  if (!sheet.el.isConnected) return;
  const weights = current.weights ?? [0.166, 0.166, 0.167, 0.167, 0.167, 0.167];
  const labels = ['视觉设计', '空间营造', '动态表现', '文字表达', '思辨推理', '创意构思'];
  $('.sheet-body', sheet.el).innerHTML = `<form class="admin-editor">
    <label class="field"><span class="field-label">${face === 'gallery' ? '策展文案' : '题目点评'}</span><textarea class="input" name="commentary" rows="8" maxlength="4000">${esc(current.commentary)}</textarea></label>
    ${face === 'arena' ? `<div class="weight-list">${labels.map((label, i) => `<label><span>${label}</span><input type="range" name="weight${i}" min="0" max="1" step="0.001" value="${weights[i]}"><output>${weights[i].toFixed(3)}</output></label>`).join('')}</div><p class="weight-sum">权重和：<strong></strong>（须为 1）</p>` : ''}
    <p class="form-error" role="alert"></p><button class="btn primary" type="submit">保存</button></form>`;
  const form = $('form', sheet.el);
  const update = () => {
    if (face !== 'arena') return;
    const values = labels.map((_, i) => Number(form.elements.namedItem(`weight${i}`).value));
    $$('.weight-list output', form).forEach((out, i) => { out.value = values[i].toFixed(3); });
    const sum = values.reduce((a, b) => a + b, 0);
    $('.weight-sum strong', form).textContent = sum.toFixed(3);
    $('button[type="submit"]', form).disabled = Math.abs(sum - 1) > 0.001;
  };
  form.addEventListener('input', update); update();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { face, commentary: form.elements.namedItem('commentary').value };
    if (face === 'arena') body.weights = labels.map((_, i) => Number(form.elements.namedItem(`weight${i}`).value));
    const done = busy($('button[type="submit"]', form), '正在保存…');
    try { await api(`admin/tasks/${encodeURIComponent(taskId)}/editorial`, { method: 'POST', body }); sheet.close(); toast('主编视角已保存'); }
    catch (error) { $('.form-error', form).textContent = error.message; done(); update(); }
  });
}

function uploadDialog() {
  const tasks = [...(state.data?.tasks ?? []), ...(state.questions ?? [])];
  const sheet = openDialog({ title: '管理员代传作品', body: `<form class="admin-editor">
    <label class="field"><span class="field-label">题目</span><select class="input" name="task" required>${tasks.map((t) => `<option value="${esc(t.id)}">${esc(t.title)}</option>`).join('')}</select></label>
    <label class="field"><span class="field-label">HTML 单文件或 ZIP</span><input class="input" type="file" name="file" accept=".html,.htm,.zip" required></label>
    <label class="field"><span class="field-label">标题</span><input class="input" name="title" maxlength="40" required></label>
    <label class="field"><span class="field-label">模型名称</span><input class="input" name="modelName" maxlength="60" required></label>
    <label class="field"><span class="field-label">摘要</span><textarea class="input" name="summary" maxlength="200" rows="2"></textarea></label>
    <div class="face-checks"><label><input type="checkbox" name="show_gallery" checked> 展览馆显示</label><label><input type="checkbox" name="show_arena"> 竞技场显示<small>默认关闭，手动开启才进配对池</small></label></div>
    <p class="form-error" role="alert"></p><button class="btn primary" type="submit">上传并通过验证</button></form>` });
  const form = $('form', sheet.el);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const field = (name) => form.elements.namedItem(name);
    const file = field('file').files[0];
    if (!file) return;
    const query = new URLSearchParams({ task: field('task').value, name: file.name, title: field('title').value,
      modelName: field('modelName').value, summary: field('summary').value,
      show_gallery: field('show_gallery').checked ? '1' : '0', show_arena: field('show_arena').checked ? '1' : '0' });
    const done = busy($('button[type="submit"]', form), '正在上传…');
    try {
      const response = await fetch(`/api/admin/works/upload?${query}`, { method: 'POST', credentials: 'same-origin', body: file });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '上传失败');
      state.workCache.clear();
      sheet.close(); toast(`已代传：${data.work.title}`); await reload();
    } catch (error) { $('.form-error', form).textContent = error.message; done(); }
  });
}

// -- users tab --
function usersView() {
  const users = state.users ?? [];
  const rows = users.map((u) => {
    const self = u.id === state.user.id;
    const target = u.role === 'admin' ? 'member' : 'admin';
    return `<tr>
      <td class="c-title"><span class="avatar" aria-hidden="true">${esc(u.name.slice(0, 1).toUpperCase())}</span><b>${esc(u.name)}</b>${self ? '<span class="badge">当前账号</span>' : ''}</td>
      <td><span class="status role-${esc(u.role)}">${icon(u.role === 'admin' ? 'shield' : 'user')}${u.role === 'admin' ? '管理员' : '成员'}</span></td>
      <td><time>${formatTime(u.createdAt)}</time></td>
      <td class="c-actions"><button class="btn sm${target === 'admin' ? ' primary' : ''}" data-role="${esc(u.id)}" data-target="${target}"${self ? ' disabled title="不能修改自己的角色"' : ''}>${target === 'admin' ? '设为管理员' : '设为成员'}</button></td>
    </tr>`;
  }).join('');
  return `${pageHero('用户管理', '用户', '账号与角色。管理员可以审核作品、调整其他账号的角色；自己的角色只能由别的管理员修改。', [['账号', users.length], ['管理员', users.filter((u) => u.role === 'admin').length]])}
  <section class="block">
    ${state.users === null ? skeleton(5) : `<div class="table-wrap"><table class="board users-table">
      <thead><tr><th class="c-title">用户名</th><th>角色</th><th>注册时间</th><th class="c-actions">操作</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`}
  </section>`;
}

// -- login / forbidden --
function loginView() {
  app().innerHTML = `<main class="gate">
    <div class="gate-panel">
      <div class="gate-brand">${LOGO}</div>
      <p class="eyebrow"><span class="eyebrow-mark" aria-hidden="true"></span>管理后台</p>
      <h1>管理后台<span class="stop">。</span></h1>
      <p class="gate-lead">同题异答展厅的共用管理端：审核投稿、管理作品与账号角色。需要管理员账号。</p>
      <form class="gate-form" novalidate>
        <label class="field"><span class="field-label">用户名</span><input class="input" name="name" autocomplete="username" maxlength="24" required></label>
        <label class="field"><span class="field-label">密码</span><input class="input" name="password" type="password" autocomplete="current-password" maxlength="128" required></label>
        <p class="form-error" role="alert"></p>
        <button class="btn primary full" type="submit">登录</button>
      </form>
      <div class="gate-foot">${themeButton()}</div>
    </div>
  </main>`;
  const form = $('form', app());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const doneBusy = busy($('[type="submit"]', form), '正在登录…');
    try {
      await api('auth/login', { method: 'POST', body: { name: form.name.value, password: form.password.value } });
      await boot();
      toast('欢迎回来');
    } catch (error) {
      $('.form-error', form).textContent = error.message;
      doneBusy();
    }
  });
  setTimeout(() => form.name.focus());
}

function forbiddenView() {
  app().innerHTML = `<main class="gate">
    <div class="gate-panel">
      <div class="gate-brand">${LOGO}</div>
      <p class="eyebrow"><span class="eyebrow-mark" aria-hidden="true"></span>管理后台</p>
      <h1>需要管理员权限<span class="stop">。</span></h1>
      <p class="gate-lead">当前账号「${esc(state.user.name)}」不是管理员。管理员可以在用户页调整角色，或由维护者在服务器上运行 <code>npm run admin -- &lt;用户名&gt;</code>。</p>
      <div class="actions">
        <button class="btn primary" data-logout>${icon('logout')}退出登录</button>
        ${themeButton()}
      </div>
    </div>
  </main>`;
}

// ---- render loop -----------------------------------------------------------------------------
function worksQuery() {
  const query = new URLSearchParams({ page: state.workPage, pageSize: 30, face: state.system });
  if (state.workTask) query.set('task', state.workTask);
  if (state.workStatus) query.set('status', state.workStatus);
  if (state.workShow) query.set('show', state.workShow);
  if (state.workSearch) query.set('search', state.workSearch);
  return query;
}
const rowSignatures = new Map();
let renderedWorkSignature = '';
let renderedContent = '';
let worldTimer = 0;
function patchWorks(newMain) {
  const oldMain = $('main.page', app());
  const oldResults = $('.work-results', oldMain);
  const newResults = $('.work-results', newMain);
  const oldBody = $('tbody', oldResults);
  const newBody = $('tbody', newResults);
  if (oldBody && newBody) {
    const existing = new Map($$('tr[data-work-key]', oldBody).map((row) => [row.dataset.workKey, row]));
    const nextKeys = new Set();
    [...newBody.children].forEach((fresh, index) => {
      const key = fresh.dataset.workKey;
      nextKeys.add(key);
      const work = state.adminWorks[index];
      const signature = JSON.stringify(work);
      let row = existing.get(key);
      if (!row || rowSignatures.get(key) !== signature) {
        if (row) row.replaceWith(fresh);
        row = fresh;
        row.classList.add('row-enter');
        rowSignatures.set(key, signature);
      }
      if (oldBody.children[index] !== row) oldBody.insertBefore(row, oldBody.children[index] || null);
    });
    existing.forEach((row, key) => { if (!nextKeys.has(key)) { row.remove(); rowSignatures.delete(key); } });
  } else if (oldResults.innerHTML !== newResults.innerHTML) {
    oldResults.replaceWith(newResults);
    rowSignatures.clear();
    state.adminWorks.forEach((w) => rowSignatures.set(`${w.task}/${w.id}`, JSON.stringify(w)));
  }
  for (const selector of ['.page-hero', '.admin-pagination', '.page-error']) {
    const oldEl = $(selector, oldMain);
    const newEl = $(selector, newMain);
    if (oldEl && newEl && oldEl.innerHTML !== newEl.innerHTML) oldEl.innerHTML = newEl.innerHTML;
    else if (!oldEl && newEl) oldMain.prepend(newEl);
    else if (oldEl && !newEl) oldEl.remove();
  }
}
async function reload({ navigation = false } = {}) {
  const requestId = ++state.requestId;
  const [route = 'review'] = routeParts();
  const system = state.system;
  let key = '';
  if (route === 'works') {
    key = worksQuery().toString();
    if (navigation || state.workKey !== key) {
      const cached = state.workCache.get(key);
      state.workKey = key;
      state.adminWorks = cached?.works ?? [];
      state.workTotal = cached?.total ?? 0;
      state.workLoading = !cached;
    }
  } else if (route === 'traffic' && !state.traffic) state.trafficLoading = true;
  if (navigation || !app().dataset.shell) render({ soft: route === 'works' && !state.workLoading });
  try {
    if (route === 'users') state.users = (await api('admin/users')).users;
    else if (route === 'works') {
      const data = await api(`admin/works?${key}`);
      if (requestId !== state.requestId || system !== state.system || routeParts()[0] !== 'works') return;
      state.workCache.set(key, data);
      if (state.workCache.size > 24) state.workCache.delete(state.workCache.keys().next().value);
      state.adminWorks = data.works;
      state.workTotal = data.total;
      state.workLoading = false;
    } else if (route === 'traffic') {
      state.traffic = await api('admin/traffic?days=30');
      state.trafficLoading = false;
    } else if (route === 'review') await loadReview();
    if (requestId !== state.requestId) return;
    state.error = '';
  } catch (error) {
    if (requestId !== state.requestId) return;
    if (error.status === 401 || error.status === 403) { await boot(); return; }
    state.error = error.message;
    state.workLoading = false;
    state.trafficLoading = false;
  }
  render({ soft: true });
}

function render({ soft = false, world = false } = {}) {
  syncThemeUi();
  if (state.user === undefined) { app().innerHTML = `<main class="gate">${skeleton(3)}</main>`; return; }
  if (!state.user) return loginView();
  if (state.user.role !== 'admin') return forbiddenView();
  const [route = 'review', sub] = routeParts();
  const known = TABS.some((tab) => tab.id === route) || (state.system === 'arena' && ['guess', 'activity'].includes(route));
  if (!known) { location.hash = '#/review'; return; }
  const body = route === 'works' ? systemWorksView() : route === 'tasks' ? tasksView() : route === 'traffic' ? trafficView() : route === 'users' ? usersView() : ['guess', 'activity'].includes(route) ? placeholderView(route) : reviewView(sub);
  const content = `${state.error ? `<p class="form-error page-error">${esc(state.error)}</p>` : ''}${body}`;
  const shellKey = `${state.system}/${route}/${sub || ''}`;
  const currentMain = $('main.page', app());
  const sameShell = app().dataset.shell === shellKey && currentMain;
  const workSignature = route === 'works' ? `${state.workKey}:${state.workLoading}:${state.workTotal}:${JSON.stringify(state.adminWorks)}:${state.error}` : '';
  if (!sameShell) {
    const prevRoute = String(app().dataset.shell ?? '').split('/')[1];
    app().dataset.shell = shellKey;
    const template = document.createElement('div');
    template.innerHTML = state.system === 'arena'
      ? `<div class="workspace ${state.sidebarCollapsed ? 'is-collapsed' : ''}">${arenaSidebar(route, sub)}<div class="workspace-content">${topbar(route)}<main class="page">${content}</main></div></div>`
      : `${topbar(route)}<main class="page">${content}</main>`;
    // 同路由且渲染内容不变时移植现有内容节点：已解码的图片和滚动位置原样保留，消除整表闪动。
    // （作品表两边列不同、必须重建；流量/用户/审核等内容与系统无关，走移植。）
    const freshMain = $('main.page', template);
    if (freshMain && currentMain && prevRoute === route && renderedContent === content) freshMain.replaceWith(currentMain);
    app().replaceChildren(...template.childNodes);
    rowSignatures.clear();
    if (route === 'works' && !state.workLoading) state.adminWorks.forEach((w) => rowSignatures.set(`${w.task}/${w.id}`, JSON.stringify(w)));
    renderedWorkSignature = workSignature;
    renderedContent = content;
    if (world && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      clearTimeout(worldTimer);
      app().classList.add('world-enter');
      worldTimer = setTimeout(() => app().classList.remove('world-enter'), 440);
    }
  } else if (route === 'works' && soft && !state.workLoading) {
    if (workSignature !== renderedWorkSignature) {
      const template = document.createElement('main'); template.className = 'page'; template.innerHTML = content;
      patchWorks(template);
      renderedWorkSignature = workSignature;
      renderedContent = content;
    }
  } else if (renderedContent !== content) {
    currentMain.innerHTML = content;
    renderedWorkSignature = workSignature;
    renderedContent = content;
  }
  document.title = `${route === 'guess' ? '模一把' : route === 'activity' ? '活动管理' : TABS.find((tab) => tab.id === route).label} · 管理后台`;
  syncThemeUi();
}

async function boot() {
  try {
    const data = await api('bootstrap');
    state.user = data.user;
    state.questions = data.questions;
  } catch {
    state.user = null;
  }
  if (state.user?.role === 'admin') {
    state.works = null;
    state.users = null;
    state.workLoading = routeParts()[0] === 'works';
    render();
    await loadCatalog();
    await reload({ navigation: true });
  }
  render();
}

// ---- events ----------------------------------------------------------------------------------
document.addEventListener('click', async (e) => {
  const system = e.target.closest('[data-system]');
  if (system && state.system !== system.dataset.system) {
    state.system = system.dataset.system; store.set('admin-system', state.system); state.workPage = 1;
    applySystemTheme();
    if (state.system === 'gallery' && ['guess', 'activity'].includes(routeParts()[0])) { location.hash = '#/review'; return; }
    if (routeParts()[0] === 'works') {
      const cached = state.workCache.get(worksQuery().toString());
      state.adminWorks = cached?.works ?? [];
      state.workTotal = cached?.total ?? 0;
      state.workLoading = !cached;
    }
    render({ world: true });
    reload();
    return;
  }
  if (e.target.closest('[data-sidebar-collapse]')) {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    store.set('admin-sidebar-collapsed', state.sidebarCollapsed ? '1' : '0');
    $('.workspace')?.classList.toggle('is-collapsed', state.sidebarCollapsed);
    const button = $('[data-sidebar-collapse]');
    button?.setAttribute('aria-expanded', String(!state.sidebarCollapsed));
    button?.setAttribute('aria-label', state.sidebarCollapsed ? '展开侧栏' : '折叠侧栏');
    button.title = state.sidebarCollapsed ? '展开侧栏' : '折叠侧栏';
    return;
  }
  if (e.target.closest('[data-theme-toggle]')) { toggleTheme(); return; }
  if (e.target.closest('[data-admin-upload]')) { uploadDialog(); return; }
  const page = e.target.closest('[data-page]');
  if (page && !page.disabled) { state.workPage = Number(page.dataset.page); await reload({ navigation: true }); return; }
  const calibrate = e.target.closest('[data-calibrate]');
  if (calibrate) { const w = state.adminWorks.find((item) => item.id === calibrate.dataset.calibrate); if (w) calibrationDialog(w); return; }
  const note = e.target.closest('[data-task-note]');
  if (note) { await editorialDialog(note.dataset.taskNote); return; }
  if (e.target.closest('[data-logout]')) {
    toast('正在退出登录…');
    await api('auth/logout', { method: 'POST' }).catch(() => {});
    state.user = null;
    state.works = null;
    state.users = null;
    render();
    toast('已退出登录');
    return;
  }
  const filter = e.target.closest('[data-filter]');
  if (filter) { state.worksFilter = filter.dataset.filter; render(); return; }
  const reviewBtn = e.target.closest('[data-review]');
  if (reviewBtn) {
    const work = state.works?.find((w) => w.id === reviewBtn.dataset.review) ?? state.adminWorks.find((w) => w.id === reviewBtn.dataset.review);
    if (work) openReview(work);
    return;
  }
  const verifyBtn = e.target.closest('[data-verify]');
  if (verifyBtn) {
    const work = state.works?.find((w) => w.id === verifyBtn.dataset.verify);
    if (!work) return;
    const doneBusy = busy(verifyBtn, '正在通过…');
    try {
      await api(`works/${encodeURIComponent(work.task)}/${encodeURIComponent(work.id)}/review`, { method: 'POST', body: { status: 'verified' } });
      toast(`已通过验证：${work.title}`);
      await reload();
    } catch (error) {
      toast(error.message);
      doneBusy();
    }
    return;
  }
  const questionBtn = e.target.closest('[data-question]');
  if (questionBtn) {
    const work = state.works?.find((w) => w.id === questionBtn.dataset.question);
    if (work && await questionWork(work)) await reload();
    return;
  }
  const deleteBtn = e.target.closest('[data-delete]');
  if (deleteBtn) {
    const work = state.works?.find((w) => w.id === deleteBtn.dataset.delete);
    if (work && await removeWork(work)) await reload();
    return;
  }
  const roleBtn = e.target.closest('[data-role]');
  if (roleBtn && !roleBtn.disabled) {
    const target = roleBtn.dataset.target;
    const user = state.users?.find((u) => u.id === roleBtn.dataset.role);
    if (!user) return;
    const doneBusy = busy(roleBtn, '正在保存…');
    try {
      await api(`admin/users/${encodeURIComponent(user.id)}/role`, { method: 'POST', body: { role: target } });
      toast(`${user.name} 现在是${target === 'admin' ? '管理员' : '普通成员'}`);
      await reload();
    } catch (error) {
      toast(error.message);
      doneBusy();
    }
  }
});
document.addEventListener('change', async (e) => {
  const toggle = e.target.closest('[data-face-toggle]');
  if (!toggle) return;
  const work = state.adminWorks.find((item) => item.id === toggle.dataset.faceToggle);
  if (!work) return;
  toggle.disabled = true;
  toggle.parentElement.classList.add('is-saving');
  toggle.parentElement.setAttribute('aria-busy', 'true');
  try {
    await api(`admin/works/${workKey(work)}/face-settings`, { method: 'POST', body: { [`show_${state.system}`]: toggle.checked } });
    toast(`${faceLabel()}开关已${toggle.checked ? '开启' : '关闭'}`);
    await reload();
  } catch (error) { toggle.checked = !toggle.checked; toggle.disabled = false; toast(error.message); }
  finally { if (toggle.isConnected) { toggle.disabled = false; toggle.parentElement.classList.remove('is-saving'); toggle.parentElement.removeAttribute('aria-busy'); } }
});
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'admin-work-filter') return;
  e.preventDefault();
  const form = e.target;
  state.workSearch = form.elements.namedItem('search').value.trim();
  state.workTask = form.elements.namedItem('task').value;
  state.workStatus = form.elements.namedItem('status').value;
  state.workShow = form.elements.namedItem('show').value;
  state.workPage = 1;
  await reload({ navigation: true });
});
addEventListener('hashchange', () => { if (state.user?.role === 'admin') reload({ navigation: true }); });

boot();
