// Account administration from the terminal.
//   npm run admin -- <username>          grant the admin role
//   npm run admin -- <username> --revoke  back to a regular member
//   npm run admin -- --create <username>  create an admin with a hidden password prompt
//   npm run admin -- --list               list accounts
import { join } from 'node:path';
import { createAuth } from './auth.mjs';
import { config, limits } from './config.mjs';
import { openDatabase } from './db.mjs';

const args = process.argv.slice(2);
const db = openDatabase(join(config.dataDir, 'platform.db'));
async function passwordFromStdin() {
  if (!process.stdin.isTTY) {
    let value = '';
    for await (const chunk of process.stdin) value += chunk;
    return value.replace(/\r?\n$/, '');
  }
  process.stdout.write('密码：');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  try {
    return await new Promise((resolve, reject) => {
      let value = '';
      const onData = (chunk) => {
        for (const char of chunk.toString('utf8')) {
          if (char === '\r' || char === '\n') {
            process.stdin.off('data', onData);
            process.stdout.write('\n');
            resolve(value);
            return;
          }
          if (char === '\u0003') {
            process.stdin.off('data', onData);
            reject(new Error('已取消'));
            return;
          }
          if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
          else value += char;
        }
      };
      process.stdin.on('data', onData);
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

try {
  if (args.includes('--create')) {
    if (args.length !== 2 || args[0] !== '--create') throw new Error('用法：npm run admin -- --create <用户名>（密码从标准输入读取）');
    const auth = createAuth(db, { admins: config.admins, secureCookies: false, sessionTtl: limits.sessionTtl });
    const user = auth.createAdmin(args[1], await passwordFromStdin());
    console.log(`已创建管理员「${user.name}」。`);
  } else if (args.includes('--list') || !args.length) {
    const users = db.prepare('SELECT name, role, created_at FROM users ORDER BY created_at').all();
    if (!users.length) console.log('还没有账号。运行 npm run admin -- --create <用户名> 创建管理员。');
    for (const user of users) console.log(`${user.role === 'admin' ? '管理员' : '成员'}\t${user.name}\t${new Date(user.created_at).toLocaleString('zh-CN')}`);
  } else {
    const name = args.find((arg) => !arg.startsWith('--'));
    if (!name || args.some((arg) => arg.startsWith('--') && arg !== '--revoke')) throw new Error('用法：npm run admin -- <用户名> [--revoke]');
  const auth = createAuth(db, { admins: config.admins, secureCookies: false, sessionTtl: limits.sessionTtl });
  const user = auth.promote(name, args.includes('--revoke') ? 'member' : 'admin');
  if (!user) {
    console.error(`找不到用户「${name}」。`);
    process.exitCode = 1;
  } else {
    console.log(`${user.name} 现在是${user.role === 'admin' ? '管理员' : '普通成员'}。`);
  }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
