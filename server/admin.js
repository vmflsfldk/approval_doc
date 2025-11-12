require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const path = require('path');
const { getPool } = require('./db');

const adminApp = express();
const PORT = process.env.ADMIN_PORT ? Number(process.env.ADMIN_PORT) : 3001;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me';
const STATIC_ROOT = path.join(__dirname, '..', 'static');

adminApp.use(express.json());
adminApp.use(express.urlencoded({ extended: false }));
adminApp.use(
  session({
    secret: SESSION_SECRET,
    name: 'admin.sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

adminApp.use('/static', express.static(STATIC_ROOT));

adminApp.get('/', (req, res) => {
  res.sendFile(path.join(STATIC_ROOT, 'admin', 'index.html'));
});

adminApp.get('/api/session', (req, res) => {
  res.json({
    authenticated: Boolean(req.session.isAdmin),
    userId: req.session.adminUser || null,
    role: req.session.adminRole || null,
  });
});

adminApp.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const normalizedUsername = typeof username === 'string' ? username.trim() : '';

  if (!normalizedUsername || !password) {
    return res.status(400).json({ error: '아이디와 비밀번호를 모두 입력해주세요.' });
  }

  try {
    const db = getPool();
      const [rows] = await db.query(
        "SELECT username, password_hash, role FROM users WHERE username = ? AND role = 'admin'",
        [normalizedUsername]
      );

    if (rows.length === 0) {
      return res.status(401).json({ error: '관리자 계정이 아니거나 비밀번호가 올바르지 않습니다.' });
    }

    const storedUser = rows[0];
    const hashedPassword = crypto.createHash('sha512').update(password).digest('base64');

    if (storedUser.password_hash !== hashedPassword) {
      return res.status(401).json({ error: '관리자 계정이 아니거나 비밀번호가 올바르지 않습니다.' });
    }

    req.session.adminUser = storedUser.username;
    req.session.adminRole = storedUser.role === 'admin' ? 'admin' : storedUser.role;
    req.session.isAdmin = true;

    res.json({ success: true });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: '관리자 로그인 중 오류가 발생했습니다.' });
  }
});

adminApp.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Admin logout error:', err);
      return res.status(500).json({ error: '로그아웃 처리 중 오류가 발생했습니다.' });
    }

    res.clearCookie('admin.sid');
    res.json({ success: true });
  });
});

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }

  return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
}

adminApp.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const db = getPool();
    const [rows] = await db.query('SELECT username, role, name FROM users ORDER BY username');
    const users = rows.map((row) => ({
      username: row.username,
      role: row.role,
      name: row.name,
    }));

    res.json({ users });
  } catch (error) {
    console.error('Admin list users error:', error);
    res.status(500).json({ error: '사용자 목록을 불러오는 중 오류가 발생했습니다.' });
  }
});

adminApp.post('/api/users', requireAdmin, async (req, res) => {
  const { username, password, role, name } = req.body;
  const trimmedUsername = typeof username === 'string' ? username.trim() : '';
  const trimmedName = typeof name === 'string' ? name.trim() : '';

  if (!trimmedUsername || !password) {
    return res.status(400).json({ error: '아이디와 비밀번호를 모두 입력해주세요.' });
  }

  if (!trimmedName) {
    return res.status(400).json({ error: '사용자 이름을 입력해주세요.' });
  }

  const normalizedRole = role === 'admin' ? 'admin' : 'user';

  const hashedPassword = crypto.createHash('sha512').update(password).digest('base64');

  try {
    const db = getPool();
    await db.query('INSERT INTO users (username, password_hash, role, name) VALUES (?, ?, ?, ?)', [
      trimmedUsername,
      hashedPassword,
      normalizedRole,
      trimmedName,
    ]);

    res.status(201).json({ success: true });
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: '이미 존재하는 사용자입니다.' });
    }

    console.error('Admin create user error:', error);
    res.status(500).json({ error: '사용자 생성 중 오류가 발생했습니다.' });
  }
});

adminApp.put('/api/users/:username/password', requireAdmin, async (req, res) => {
  const { username } = req.params;
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: '새 비밀번호를 입력해주세요.' });
  }

  const hashedPassword = crypto.createHash('sha512').update(password).digest('base64');

  try {
    const db = getPool();
    const [result] = await db.query('UPDATE users SET password_hash = ? WHERE username = ?', [
      hashedPassword,
      username,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Admin update password error:', error);
    res.status(500).json({ error: '비밀번호 변경 중 오류가 발생했습니다.' });
  }
});

function start() {
  adminApp.listen(PORT, () => {
    console.log(`Approval admin interface listening on port ${PORT}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = { adminApp, start };
