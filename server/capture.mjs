// Uniform screenshots of submitted works, taken like the archive's own captures: a fresh
// browser context at 1440×900 and a 390×844 touch phone, default state, light scheme.
// Needs Playwright and a local Chrome; without them uploads simply show a text cover.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SHOTS = [
  { id: 'first', viewport: { width: 1440, height: 900 }, mobile: false },
  { id: 'mobile', viewport: { width: 390, height: 844 }, mobile: true },
];

export function createCapturer({ config, library }) {
  let browser = null;
  let available = config.capture;
  let running = false;
  const queue = [];

  async function launch() {
    if (!browser) {
      const { chromium } = await import('playwright');
      browser = await chromium.launch(config.captureChannel ? { channel: config.captureChannel } : {});
    }
    return browser;
  }

  async function capture(work) {
    const instance = await launch();
    const captures = {};
    for (const shot of SHOTS) {
      const context = await instance.newContext({ viewport: shot.viewport, deviceScaleFactor: 1, isMobile: shot.mobile, hasTouch: shot.mobile, colorScheme: 'light' });
      try {
        const page = await context.newPage();
        await page.goto(`${library.originOf(work.contentKey)}/`, { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(3500);
        mkdirSync(join(library.mediaDir, work.id), { recursive: true });
        await page.screenshot({ path: join(library.mediaDir, work.id, `${shot.id}.jpg`), type: 'jpeg', quality: 84 });
        captures[shot.id] = `${shot.id}.jpg`;
      } catch (error) {
        console.warn(`截图失败 ${work.id} ${shot.id}：${error.message.split('\n')[0]}`);
      } finally {
        await context.close();
      }
    }
    if (Object.keys(captures).length && library.hasDirectory(work.id)) library.setCaptures(work.id, captures);
  }

  async function drain() {
    if (running) return;
    running = true;
    while (queue.length && available) {
      const work = queue.shift();
      try {
        await capture(work);
      } catch (error) {
        available = false;
        queue.length = 0;
        console.warn(`自动截图不可用（${error.message.split('\n')[0]}）。上传作品将显示文字封面。`);
      }
    }
    running = false;
  }

  return {
    get available() { return available; },
    enqueue(work) {
      if (!available) return;
      queue.push(work);
      drain();
    },
    async close() { await browser?.close().catch(() => {}); },
  };
}
