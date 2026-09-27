// Arena fold. The content server injects this script only into blind-comparison frames;
// stored works are served exactly as uploaded everywhere else. It hides a work's own
// floating control panels (small fixed / absolute boxes holding buttons or inputs, plus the
// common GUI libraries) so both sides are compared on the work itself. The arena toolbar
// shows them again; hidden panels keep their DOM and state.
(() => {
  const root = document.documentElement;
  const LIBS = '.lil-gui.root, .dg.main, .tp-dfwv';
  const CONTROLS = 'button, input, select, textarea, [role="button"], [role="slider"], summary';
  const SCENE = 'canvas, video, iframe';
  const marked = new Set();

  root.setAttribute('data-sp-fold', '');
  const style = document.createElement('style');
  style.textContent = 'html[data-sp-fold] [data-sp-fold-ui]{display:none!important}';
  root.appendChild(style);

  const report = () => {
    try { parent.postMessage({ source: 'sp-fold', count: marked.size }, '*'); } catch { /* detached */ }
  };

  // The outermost positioned, panel-sized ancestor of a control that holds no scene.
  function panelOf(control, limit) {
    let best = null;
    for (let el = control; el && el !== document.body && el !== root; el = el.parentElement) {
      const rect = el.getBoundingClientRect();
      if (rect.width * rect.height > limit || el.querySelector(SCENE)) break;
      if (/^(fixed|absolute|sticky)$/.test(getComputedStyle(el).position)) best = el;
    }
    return best;
  }

  function scan() {
    if (!document.body) return;
    const area = innerWidth * innerHeight;
    const found = new Set(document.querySelectorAll(LIBS));
    for (const control of document.body.querySelectorAll(CONTROLS)) {
      if (!control.getClientRects().length || [...found].some((box) => box.contains(control))) continue;
      const box = panelOf(control, area * 0.35);
      if (box) found.add(box);
    }
    const all = [...found, ...marked];
    const fresh = [...found].filter((box) => !marked.has(box) && !all.some((other) => other !== box && other.contains(box)));
    // Many boxes, or boxes covering much of the page, are the work itself (a keyboard of
    // positioned keys, a control-driven layout): leave those works untouched.
    const covered = fresh.reduce((sum, box) => { const r = box.getBoundingClientRect(); return sum + r.width * r.height; }, 0);
    if (marked.size + fresh.length > 6 || covered > area * 0.4) return;
    for (const box of fresh) {
      box.setAttribute('data-sp-fold-ui', '');
      marked.add(box);
    }
    if (fresh.length) report();
  }

  addEventListener('message', (event) => {
    if (event.source !== parent || event.data?.source !== 'sp-arena') return;
    root.toggleAttribute('data-sp-fold', Boolean(event.data.fold));
  });
  // Panels built by module scripts or after assets arrive show up late.
  addEventListener('load', () => {
    report();
    for (const wait of [0, 600, 1800, 4000]) setTimeout(scan, wait);
  });
})();
