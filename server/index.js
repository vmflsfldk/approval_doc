require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_NAME = 'approvaldb';

let pool;
function getPool() {
  if (!pool) {
    const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD } = process.env;
    if (!DB_HOST || !DB_USER || !DB_PASSWORD) {
      throw new Error('Database credentials are not fully configured.');
    }

    pool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT ? Number(DB_PORT) : 3306,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  return pool;
}

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
  });
});

app.post('/api/login', async (req, res) => {
  const { id, password } = req.body;

  if (!id || !password) {
    return res.status(400).json({ error: '아이디와 비밀번호를 모두 입력해주세요.' });
  }

  try {
    const db = getPool();
    const [rows] = await db.query('SELECT username, password_hash FROM users WHERE username = ?', [id]);

    if (rows.length === 0) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    const storedUser = rows[0];
    const hashedPassword = crypto.createHash('sha512').update(password).digest('base64');

    if (storedUser.password_hash !== hashedPassword) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    req.session.userId = storedUser.username;
    res.json({ success: true });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
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

const DATA_DIR = path.join(__dirname, '..', 'data');
let cachedDocuments = null;

function readDataset(filename, exportName) {
  const filePath = path.join(DATA_DIR, filename);
  const scriptContent = fs.readFileSync(filePath, 'utf-8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(scriptContent, context, { filename: filePath });

  if (!(exportName in context)) {
    throw new Error(`Expected ${exportName} to be defined in ${filename}`);
  }

  return context[exportName];
}

function loadDocuments() {
  if (!cachedDocuments) {
    cachedDocuments = {
      documents: readDataset('data.js', 'HIWORKS_DATA'),
      info: readDataset('data_info.js', 'BACKUP_INFO'),
    };
  }

  return cachedDocuments;
}

app.get('/api/documents', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }

  try {
    const { documents, info } = loadDocuments();
    res.json({ documents, info });
  } catch (error) {
    console.error('Document load error:', error);
    res.status(500).json({ error: '문서를 불러오는 중 오류가 발생했습니다.' });
  }
});

app.listen(PORT, () => {
  console.log(`Approval backup viewer listening on port ${PORT}`);
});
