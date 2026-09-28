// Accounts and sessions. Passwords use scrypt; the session token lives only in an
// HttpOnly cookie and the database keeps its SHA-256.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { fail, parseCookies } from './http.mjs';

const COOKIE = 'sp_session';
const SCRYPT = { N: 16384, r: 8, p: 1 };
const DUMMY_SALT = randomBytes(16).toString('hex');

export const newId = (bytes = 12) => randomBytes(bytes).toString('hex');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const nameKey = (name) => name.normalize('NFKC').trim().toLowerCase();

export function createAuth(db, { admins, secureCookies, cookieSameSite = 'Lax', sessionTtl }) {
  if (!['Lax', 'Strict', 'None'].includes(cookieSameSite)) throw new Error('COOKIE_SAME_SITE must be Lax, Strict or None');
  if (cookieSameSite === 'None' && !secureCookies) throw new Error('COOKIE_SAME_SITE=None requires COOKIE_SECURE=1');
  const q = {
    userByKey: db.prepare('SELECT * FROM users WHERE name_key = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    listUsers: db.prepare('SELECT * FROM users ORDER BY created_at'),
    insertUser: db.prepare('INSERT INTO users (id, name, name_key, role, salt, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    setRole: db.prepare('UPDATE users SET role = ? WHERE id = ?'),
    setNickname: db.prepare('UPDATE users SET nickname = ? WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    session: db.prepare('SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  };
  const hashPassword = (password, salt) => scryptSync(password, salt, 32, SCRYPT).toString('hex');
  const roleFor = (user) => (admins.includes(user.name_key) ? 'admin' : user.role);

  function syncRole(user) {
    const role = roleFor(user);
    if (role !== user.role) {
      q.setRole.run(role, user.id);
      user.role = role;
    }
    return user;
  }

  function validName(raw) {
    const name = String(raw ?? '').normalize('NFKC').trim();
    if (!/^[\p{L}\p{N}_-]{2,24}$/u.test(name)) fail(400, '用户名为 2–24 位文字、数字、下划线或连字符');
    return name;
  }
  function validPassword(raw) {
    const password = String(raw ?? '');
    if (password.length < 8 || password.length > 128) fail(400, '密码需要 8–128 位');
    return password;
  }

  return {
    public: (user) => (user ? { id: user.id, name: user.name, nickname: user.nickname || user.name, role: user.role } : null),

    updateProfile(user, body) {
      if (typeof body.nickname !== 'string') fail(400, '请填写昵称');
      const nickname = body.nickname.normalize('NFKC').trim();
      if (!nickname || nickname.length > 24 || /[\u0000-\u001f\u007f]/.test(nickname)) fail(400, '昵称为 1–24 个字，不能包含换行或控制字符');
      q.setNickname.run(nickname, user.id);
      return q.userById.get(user.id);
    },

    register(rawName, rawPassword) {
      const name = validName(rawName);
      const password = validPassword(rawPassword);
      const key = nameKey(name);
      if (q.userByKey.get(key)) fail(409, '这个用户名已被使用');
      const salt = randomBytes(16).toString('hex');
      const id = newId(8);
      q.insertUser.run(id, name, key, admins.includes(key) ? 'admin' : 'member', salt, hashPassword(password, salt), Date.now());
      return q.userById.get(id);
    },

    login(rawName, rawPassword) {
      const user = q.userByKey.get(nameKey(String(rawName ?? '')));
      const password = String(rawPassword ?? '').slice(0, 128);
      // Hash even for unknown names so response time does not reveal which accounts exist.
      const actual = Buffer.from(hashPassword(password, user?.salt ?? DUMMY_SALT), 'hex');
      if (!user || !timingSafeEqual(actual, Buffer.from(user.hash, 'hex'))) fail(401, '用户名或密码不正确');
      return syncRole(user);
    },

    startSession(res, userId) {
      const token = randomBytes(32).toString('base64url');
      const now = Date.now();
      q.purgeSessions.run(now);
      q.insertSession.run(sha256(token), userId, now, now + sessionTtl);
      res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=${cookieSameSite}; Max-Age=${Math.floor(sessionTtl / 1000)}${secureCookies ? '; Secure' : ''}`);
    },

    endSession(req, res) {
      const token = parseCookies(req.headers.cookie)[COOKIE];
      if (token) q.deleteSession.run(sha256(token));
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=${cookieSameSite}; Max-Age=0${secureCookies ? '; Secure' : ''}`);
    },

    userFrom(req) {
      const token = parseCookies(req.headers.cookie)[COOKIE];
      if (!token) return null;
      const user = q.session.get(sha256(token), Date.now());
      return user ? syncRole(user) : null;
    },

    promote(rawName, role = 'admin') {
      const user = q.userByKey.get(nameKey(String(rawName ?? '')));
      if (!user) return null;
      q.setRole.run(role, user.id);
      return { ...user, role };
    },

    // Admin web app: every account with its effective role, never the credentials.
    list() {
      return q.listUsers.all().map((user) => ({ id: user.id, name: user.name, role: roleFor(user), createdAt: new Date(user.created_at).toISOString() }));
    },

    setRole(actor, userId, role) {
      if (!['admin', 'member'].includes(role)) fail(400, '角色无效');
      const user = q.userById.get(String(userId ?? ''));
      if (!user) fail(404, '用户不存在');
      if (user.id === actor.id) fail(409, '不能修改自己的角色，避免把自己锁在管理端之外');
      q.setRole.run(role, user.id);
      return { id: user.id, name: user.name, role };
    },
  };
}
