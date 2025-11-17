require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const path = require('path');
const archiver = require('archiver');
const puppeteer = require('puppeteer');
const { getPool } = require('./db');
const { getBackupInfo, queryDocuments, getDocumentsByNumbers } = require('./dataAccess');

const app = express();
const PORT = process.env.PORT || 3000;
const INITIAL_PASSWORD_HASH = process.env.INITIAL_PASSWORD_HASH || '';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}/`;

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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildDocumentHtml(doc) {
  const title = escapeHtml(doc.title || doc.document_code || doc.no || '문서');
  const documentCode = escapeHtml(doc.document_code || doc.no || '-');
  const drafter = escapeHtml(doc.user_name || '-');
  const regDate = escapeHtml(doc.regdate || '-');
  const content = doc.content || '';

  return `<!doctype html>
  <html lang="ko">
    <head>
      <meta charset="utf-8" />
      <base href="${BASE_URL}">
      <title>${title}</title>
      <style>
        body { font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif; color: #222; margin: 32px; }
        h1 { font-size: 20px; margin-bottom: 16px; }
        .meta { margin-bottom: 16px; padding: 12px; background: #f7f7f7; border: 1px solid #e5e5e5; }
        .meta-item { margin-bottom: 6px; }
        .content { margin-top: 12px; }
        .content h2 { font-size: 16px; }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <div class="meta">
        <div class="meta-item"><strong>문서 번호:</strong> ${documentCode}</div>
        <div class="meta-item"><strong>기안자:</strong> ${drafter}</div>
        <div class="meta-item"><strong>기안 일시:</strong> ${regDate}</div>
      </div>
      <div class="content">${content}</div>
    </body>
  </html>`;
}

async function renderPdfBuffers(documents) {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    const results = [];

    for (const doc of documents) {
      const html = buildDocumentHtml(doc);
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const buffer = await page.pdf({ format: 'A4', printBackground: true });
      const filename = `${doc.document_code || doc.no || 'document'}.pdf`;
      results.push({ buffer, filename });
    }

    return results;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

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

app.post('/api/documents/pdf', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }

  const documentIds = Array.isArray(req.body.documentIds)
    ? req.body.documentIds.map((id) => (typeof id === 'string' || typeof id === 'number' ? String(id) : '')).filter(Boolean)
    : [];

  if (documentIds.length === 0) {
    return res.status(400).json({ error: '다운로드할 문서를 선택해주세요.' });
  }

  try {
    const userContext = { isAdmin: req.session.userRole === 'admin', userName: req.session.displayName };
    const documents = getDocumentsByNumbers(documentIds, userContext);

    if (!documents || documents.length === 0) {
      return res.status(404).json({ error: '요청한 문서를 찾을 수 없습니다.' });
    }

    const pdfBuffers = await renderPdfBuffers(documents);

    if (pdfBuffers.length === 1) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${pdfBuffers[0].filename}"`);
      return res.send(pdfBuffers[0].buffer);
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="documents.zip"');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      throw err;
    });

    archive.pipe(res);
    pdfBuffers.forEach((item) => archive.append(item.buffer, { name: item.filename }));
    await archive.finalize();
  } catch (error) {
    console.error('PDF generation error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'PDF를 생성하는 중 오류가 발생했습니다.' });
    } else {
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`Approval backup viewer listening on port ${PORT}`);
});
