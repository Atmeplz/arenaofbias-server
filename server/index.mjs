// Starts the platform: the site with its API, and the separate content server for works.
import { createServer } from 'node:http';
import { createPlatform } from './app.mjs';
import { config, limits } from './config.mjs';

let platform;
try {
  platform = createPlatform({ config, limits });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const site = createServer(platform.handleSite);
const content = createServer(platform.handleContent);
let ready = 0;
const started = () => {
  if (++ready < 2) return;
  const shown = config.host === '127.0.0.1' || config.host === '0.0.0.0' ? 'localhost' : config.host;
  console.log(`同题异答 · 平台已启动
  站点  http://${shown}:${config.port}/
  作品  ${config.contentTemplate.replace('{token}', '<token>')}
  数据  ${config.dataDir}`);
};
for (const server of [site, content]) {
  server.on('error', (error) => {
    console.error(`无法启动：${error.message}`);
    process.exit(1);
  });
}
site.listen(config.port, config.host, started);
content.listen(config.contentPort, config.host, started);

async function shutdown() {
  site.close();
  content.close();
  await platform.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
