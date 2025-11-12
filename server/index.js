require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { getPool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

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
    const [rows] = await db.query('SELECT username, password_hash, role, name FROM users WHERE username = ?', [normalizedId]);

    if (rows.length === 0) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    const storedUser = rows[0];
    const hashedPassword = crypto.createHash('sha512').update(password).digest('base64');

    if (storedUser.password_hash !== hashedPassword) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
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

function discoverDataChunks() {
  const entries = fs.readdirSync(DATA_DIR);
  return entries
    .filter((file) => /^data\d+\.js$/.test(file) && file !== 'data_info.js')
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)[0], 10);
      const numB = parseInt(b.match(/\d+/)[0], 10);
      return numA - numB;
    });
}

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
    const chunkFiles = discoverDataChunks();
    const documents = [];

    chunkFiles.forEach((file) => {
      try {
        const chunk = readDataset(file, 'HIWORKS_DATA');
        if (!Array.isArray(chunk)) {
          throw new Error('Chunk did not export an array');
        }
        documents.push(...chunk);
      } catch (error) {
        console.error(`Failed to load data chunk ${file}:`, error);
        throw error;
      }
    });

    cachedDocuments = {
      documents,
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
    const isAdmin = req.session.userRole === 'admin';
    const userName = req.session.displayName;

    const filteredDocuments = isAdmin
      ? documents
      : documents.filter((doc) => {
          if (!doc || !doc.user_name || !userName) {
            return false;
          }

          return doc.user_name.trim() === userName.trim();
        });

    res.json({ documents: filteredDocuments, info });
  } catch (error) {
    console.error('Document load error:', error);
    res.status(500).json({ error: '문서를 불러오는 중 오류가 발생했습니다.' });
  }
});

app.listen(PORT, () => {
  console.log(`Approval backup viewer listening on port ${PORT}`);
});
