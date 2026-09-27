// Trial-load probe. The content server injects this script only into draft previews (the
// upload page's trial load); stored works are served exactly as uploaded.
(() => {
  const send = (type, data = {}) => {
    try { parent.postMessage({ source: 'sp-probe', type, at: Math.round(performance.now()), ...data }, '*'); } catch { /* detached */ }
  };
  const text = (value) => String(value ?? '').slice(0, 300);
  let reported = 0;
  const limited = (type, data) => { if (reported++ < 40) send(type, data); };

  send('boot');
  addEventListener('error', (event) => {
    const target = event.target;
    if (target && target !== window && (target.src || target.href)) {
      limited('resource', { url: text(target.src || target.href), tag: target.tagName });
    } else {
      limited('error', { message: text(event.message), where: text(`${event.filename || ''}${event.lineno ? `:${event.lineno}` : ''}`) });
    }
  }, true);
  addEventListener('unhandledrejection', (event) => {
    limited('error', { message: text(event.reason?.message ?? event.reason), where: 'Promise' });
  });
  document.addEventListener('securitypolicyviolation', (event) => {
    limited('blocked', { url: text(event.blockedURI), directive: text(event.effectiveDirective) });
  });
  const consoleError = console.error;
  console.error = (...args) => {
    limited('console', { message: text(args.map((arg) => (arg instanceof Error ? arg.message : typeof arg === 'string' ? arg : '')).join(' ')) });
    return consoleError.apply(console, args);
  };
  document.addEventListener('DOMContentLoaded', () => send('dom'));
  addEventListener('load', () => {
    send('load');
    // Give scenes a moment to draw, then describe what is on screen.
    setTimeout(() => {
      const canvases = [...document.querySelectorAll('canvas')].filter((canvas) => canvas.width * canvas.height > 0 && canvas.getClientRects().length);
      const media = document.querySelectorAll('img, svg, video').length;
      const words = (document.body?.innerText ?? '').trim().length;
      send('paint', { canvases: canvases.length, media, words });
    }, 1800);
  });
})();
