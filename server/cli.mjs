// Account administration from the terminal.
//   npm run admin -- <username>          grant the admin role
//   npm run admin -- <username> --revoke  back to a regular member
//   npm run admin -- --list               list accounts
import { join } from 'node:path';
import { createAuth } from './auth.mjs';
import { config, limits } from './config.mjs';
import { openDatabase } from './db.mjs';

const args = process.argv.slice(2);
const db = openDatabase(join(config.dataDir, 'platform.db'));
if (args.includes('--list') || !args.length) {
  const users = db.prepare('SELECT name, role, created_at FROM users ORDER BY created_at').all();
  if (!users.length) console.log('还没有账号。先在网站上注册，再运行 npm run admin -- <用户名>。');
  for (const user of users) console.log(`${user.role === 'admin' ? '管理员' : '成员'}\t${user.name}\t${new Date(user.created_at).toLocaleString('zh-CN')}`);
} else {
  const name = args.find((arg) => !arg.startsWith('--'));
  const auth = createAuth(db, { admins: config.admins, secureCookies: false, sessionTtl: limits.sessionTtl });
  const user = auth.promote(name, args.includes('--revoke') ? 'member' : 'admin');
  if (!user) {
    console.error(`找不到用户「${name}」。`);
    process.exitCode = 1;
  } else {
    console.log(`${user.name} 现在是${user.role === 'admin' ? '管理员' : '普通成员'}。`);
  }
}
db.close();
