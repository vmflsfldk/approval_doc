require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const path = require('path');
const { getPool } = require('./db');
const { getBackupInfo, queryDocuments } = require('./dataAccess');

const app = express();
const PORT = process.env.PORT || 3000;
const INITIAL_PASSWORD_HASH = process.env.INITIAL_PASSWORD_HASH || '';

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-me',
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

const STATIC_DIR = path.join(__dirname, '..', 'static');
app.use('/static', express.static(STATIC_DIR));

const DATA_DIR = path.join(__dirname, '..', 'data');
app.use('/data', express.static(DATA_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'backup-index.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'login.html'));
});

app.get('/api/session', (req, res) => {
  res.json({
    authenticated: Boolean(req.session.userId),
    userId: req.session.userId || null,
    role: req.session.userRole || null,
    name: req.session.displayName || null,
  });
});

app.post('/api/login', async (req, res) => {
  const { id, password } = req.body;
  const normalizedId = typeof id === 'string' ? id.trim() : '';

  if (!normalizedId || !password) {
    return res.status(400).json({ error: '아이디와 비밀번호를 모두 입력해주세요.' });
  }

  try {
    const db = getPool();
    const [rows] = await db.query(
      'SELECT username, password_hash, role, name, must_change_password FROM users WHERE username = ?',
      [normalizedId]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    const storedUser = rows[0];
    const hashedPassword = crypto.createHash('sha512').update(password).digest('base64');

    if (storedUser.password_hash !== hashedPassword) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    const requiresPasswordChange = Boolean(Number(storedUser.must_change_password)) ||
      (INITIAL_PASSWORD_HASH && storedUser.password_hash === INITIAL_PASSWORD_HASH);

    if (requiresPasswordChange) {
      return res.json({ requirePasswordChange: true, userId: storedUser.username });
    }

    req.session.userId = storedUser.username;
    req.session.userRole = storedUser.role === 'admin' ? 'admin' : 'user';
    req.session.displayName = storedUser.name ? storedUser.name.trim() : '';
    res.json({ success: true });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
  }
});

app.post('/api/password/change', async (req, res) => {
  const { id, currentPassword, newPassword } = req.body;
  const normalizedId = typeof id === 'string' ? id.trim() : '';
  const currentPasswordValue = typeof currentPassword === 'string' ? currentPassword : '';
  const newPasswordValue = typeof newPassword === 'string' ? newPassword : '';

  if (!normalizedId || !currentPasswordValue || !newPasswordValue) {
    return res.status(400).json({ error: '아이디, 현재 비밀번호, 새 비밀번호를 모두 입력해주세요.' });
  }

  try {
    const db = getPool();
    const [rows] = await db.query(
      'SELECT username, password_hash, role, name, must_change_password FROM users WHERE username = ?',
      [normalizedId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    const storedUser = rows[0];
    const hashedCurrent = crypto.createHash('sha512').update(currentPasswordValue).digest('base64');

    if (storedUser.password_hash !== hashedCurrent) {
      return res.status(401).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
    }

    const requiresPasswordChange = Boolean(Number(storedUser.must_change_password)) ||
      (INITIAL_PASSWORD_HASH && storedUser.password_hash === INITIAL_PASSWORD_HASH);

    if (!requiresPasswordChange) {
      return res.status(400).json({ error: '이미 비밀번호가 변경되었습니다.' });
    }

    if (currentPasswordValue === newPasswordValue) {
      return res.status(400).json({ error: '새 비밀번호는 현재 비밀번호와 달라야 합니다.' });
    }

    const hashedNew = crypto.createHash('sha512').update(newPasswordValue).digest('base64');

    await db.query(
      'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE username = ?',
      [hashedNew, storedUser.username]
    );

    req.session.userId = storedUser.username;
    req.session.userRole = storedUser.role === 'admin' ? 'admin' : 'user';
    req.session.displayName = storedUser.name ? storedUser.name.trim() : '';

    res.json({ success: true });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: '비밀번호 변경 중 오류가 발생했습니다.' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
      return res.status(500).json({ error: '로그아웃 처리 중 오류가 발생했습니다.' });
    }

    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

app.get('/api/documents', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }

  try {
    const isAdmin = req.session.userRole === 'admin';
    const userName = req.session.displayName;
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = parseInt(req.query.perPage, 10) || 10;
    const searchWord = typeof req.query.searchWord === 'string' ? req.query.searchWord : '';
    const searchDrafter = typeof req.query.searchDrafter === 'string' ? req.query.searchDrafter : '';
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : '';
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : '';

    const { documents, total, page: normalizedPage, perPage: normalizedPerPage } = queryDocuments({
      page,
      perPage,
      isAdmin,
      userName,
      filters: {
        searchWord,
        searchDrafter,
        startDate,
        endDate,
      },
    });

    const info = getBackupInfo();

    res.json({
      documents,
      info,
      pagination: {
        total,
        page: normalizedPage,
        perPage: normalizedPerPage,
      },
    });
  } catch (error) {
    console.error('Document load error:', error);
    res.status(500).json({ error: '문서를 불러오는 중 오류가 발생했습니다.' });
  }
});

app.listen(PORT, () => {
  console.log(`Approval backup viewer listening on port ${PORT}`);
});
