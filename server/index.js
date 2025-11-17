require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
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

const PRINT_TEMPLATE_PATH = path.join(__dirname, '..', 'static', 'scripts', 'template.js');
let cachedPrintTemplate = null;

function loadPrintTemplate() {
  if (cachedPrintTemplate) {
    return cachedPrintTemplate;
  }

  const templateFile = fs.readFileSync(PRINT_TEMPLATE_PATH, 'utf-8');
  const match = templateFile.match(/var PRINT_PAGE='(.*?)';/s);

  if (!match || match.length < 2) {
    throw new Error('PRINT_PAGE template could not be loaded');
  }

  cachedPrintTemplate = match[1];
  return cachedPrintTemplate;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePath(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }

  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function applyPrintTemplate(data) {
  const template = loadPrintTemplate();
  const printMode = data.print_mode === 'content' ? 'content' : 'document';
  let html = template;

  html = html.replace(
    /{{if print_mode === "content"}}([\s\S]*?){{else}}([\s\S]*?){{\/if}}/,
    (_, contentView, documentView) => (printMode === 'content' ? contentView : documentView)
  );

  const htmlReplacements = {
    content: data.content || '',
    'print_info.print_basic': data.print_info?.print_basic || '',
    'print_info.print_simple': data.print_info?.print_simple || '',
  };

  Object.entries(htmlReplacements).forEach(([key, value]) => {
    const pattern = new RegExp(`{{html ${escapeRegExp(key)}}}`, 'g');
    html = html.replace(pattern, value);
  });

  const textReplacements = {
    form_title: escapeHtml(data.form_title || ''),
    title: escapeHtml(data.title || ''),
    'print_info.second_line_view_flag': escapeHtml(data.print_info?.second_line_view_flag || ''),
    'print_info.third_line_view_flag': escapeHtml(data.print_info?.third_line_view_flag || ''),
    'print_info.fourth_line_view_flag': escapeHtml(data.print_info?.fourth_line_view_flag || ''),
    'print_info.loc_line_type_f': escapeHtml(data.print_info?.loc_line_type_f || ''),
  };

  Object.entries(textReplacements).forEach(([key, value]) => {
    const pattern = new RegExp(`\\$\\{${escapeRegExp(key)}\\}`, 'g');
    html = html.replace(pattern, value);
  });

  const baseTag = `<base href="${BASE_URL}">`;
  html = html.replace('<head>', `<head>${baseTag}`);

  return html;
}

function buildBindingScript(doc) {
  const normalizeList = (list) => (Array.isArray(list) ? list : []);
  const attachments = normalizeList(doc.attached_file_list).map((file) => ({
    file_size: file.file_size || '',
    ext: normalizePath(file.ext || ''),
    org_file_name: file.org_file_name || '',
    download_url: normalizePath(file.download_url || ''),
  }));

  const comments = normalizeList(doc.comments).map((item) => ({
    type: item.type || '',
    profile_url: normalizePath(item.profile_url || ''),
    user_name: item.user_name || '',
    title: item.title || '',
    comment: item.comment || '',
    regdate: item.regdate || '',
  }));

  const commentsHistory = normalizeList(doc.comments_history).map((item) => ({
    type: item.type || '',
    profile_url: normalizePath(item.profile_url || ''),
    user_name: item.user_name || '',
    title: item.title || '',
    comment: item.comment || '',
    regdate: item.regdate || '',
  }));

  const serialized = JSON.stringify({ attachments, comments, commentsHistory });

  return `<script>
    (function() {
      const data = ${serialized};

      function escapeHtml(value) {
        return String(value || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      function normalizePath(value) {
        if (!value || typeof value !== 'string') {
          return '';
        }

        return value.replace(/\\\\/g, '/').replace(/^\\.\\//, '');
      }

      function formatMultiline(text) {
        return escapeHtml(text).replace(/\n/g, '<br />');
      }

      function createAttachmentSpan(file) {
        const span = document.createElement('span');
        const iconSrc = normalizePath(file.ext);
        if (iconSrc) {
          const img = document.createElement('img');
          img.src = iconSrc;
          img.alt = '';
          img.className = 'attached';
          span.appendChild(img);
        }

        const link = document.createElement('a');
        link.href = normalizePath(file.download_url);
        link.textContent = file.org_file_name || '';
        link.target = '_blank';
        span.appendChild(link);

        if (file.file_size) {
          span.appendChild(document.createTextNode(` (${file.file_size})`));
        }

        return span;
      }

      function renderAttachments() {
        const container = document.getElementById('print_attached_files');
        if (!container || !data.attachments.length) {
          return;
        }

        const table = container.querySelector('table');
        table.innerHTML = '<caption>별첨 테이블</caption>';
        const tbody = document.createElement('tbody');
        const row = document.createElement('tr');
        const cell = document.createElement('td');

        data.attachments.forEach((file) => {
          cell.appendChild(createAttachmentSpan(file));
        });

        row.appendChild(cell);
        tbody.appendChild(row);
        table.appendChild(tbody);
        container.style.display = 'block';
      }

      function renderComments(targetId, items) {
        const container = document.getElementById(targetId);
        if (!container || !items.length) {
          return;
        }

        const tbody = container.querySelector('tbody');

        items.forEach((item) => {
          const tr = document.createElement('tr');
          const userTd = document.createElement('td');
          const profile = normalizePath(item.profile_url);

          if (profile) {
            const img = document.createElement('img');
            img.src = profile;
            img.alt = '';
            img.style.width = '24px';
            img.style.height = '24px';
            img.style.marginRight = '8px';
            userTd.appendChild(img);
          }

          const name = document.createElement('div');
          name.textContent = item.user_name || '';
          userTd.appendChild(name);

          const date = document.createElement('div');
          date.className = 'date';
          date.textContent = item.regdate || '';
          userTd.appendChild(date);

          const dividerTd = document.createElement('td');
          dividerTd.textContent = '';

          const commentTd = document.createElement('td');
          if (item.title) {
            const titleEl = document.createElement('div');
            titleEl.innerHTML = formatMultiline(item.title);
            commentTd.appendChild(titleEl);
          }

          const body = document.createElement('div');
          body.innerHTML = formatMultiline(item.comment);
          commentTd.appendChild(body);

          tr.appendChild(userTd);
          tr.appendChild(dividerTd);
          tr.appendChild(commentTd);
          tbody.appendChild(tr);
        });

        container.style.display = 'block';
      }

      function ensureBaseTag() {
        if (!document.querySelector('base')) {
          const base = document.createElement('base');
          base.href = '${BASE_URL}';
          document.head.prepend(base);
        }
      }

      function init() {
        ensureBaseTag();
        renderAttachments();
        renderComments('print_comments', data.comments);
        renderComments('print_comments_history', data.commentsHistory);
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    })();
  </script>
  <script src="static/scripts/print.js"></script>`;
}

function buildDocumentHtml(doc) {
  const templateHtml = applyPrintTemplate(doc);
  const bindingScript = buildBindingScript(doc);

  return templateHtml.replace('</body></html>', `${bindingScript}</body></html>`);
}

async function renderPdfBuffers(documents) {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    const results = [];
    const failures = [];

    for (const doc of documents) {
      const identifier = doc.document_code || doc.no || 'document';
      try {
        const html = buildDocumentHtml(doc);
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfOutput = await page.pdf({ format: 'A4', printBackground: true });
        const buffer = Buffer.isBuffer(pdfOutput) ? pdfOutput : Buffer.from(pdfOutput);

        if (!Buffer.isBuffer(buffer)) {
          throw new Error('PDF output is not a valid Buffer');
        }

        const filename = `${identifier}.pdf`;
        results.push({ buffer, filename });
      } catch (error) {
        console.error(`PDF render error for document ${identifier}:`, error);
        failures.push({ document: identifier, reason: error && error.message ? error.message : 'Unknown error' });
      }
    }

    return { pdfs: results, failures };
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

    const { pdfs, failures } = await renderPdfBuffers(documents);
    const validationFailures = [];
    const validPdfs = [];

    pdfs.forEach((item) => {
      const filename = typeof item.filename === 'string' && item.filename.trim() ? item.filename.trim() : null;
      if (!Buffer.isBuffer(item.buffer) || !filename) {
        validationFailures.push({ document: filename || 'unknown', reason: 'Invalid PDF buffer or filename' });
        return;
      }

      validPdfs.push({ buffer: item.buffer, filename });
    });

    const failedDocuments = [...failures, ...validationFailures];

    if (failedDocuments.length > 0 || validPdfs.length === 0) {
      return res.status(500).json({
        error: '일부 문서의 PDF 생성에 실패했습니다.',
        failedDocuments,
      });
    }

    if (validPdfs.length === 1) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${validPdfs[0].filename}"`);
      return res.send(validPdfs[0].buffer);
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="documents.zip"');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      throw err;
    });

    archive.pipe(res);
    validPdfs.forEach((item) => archive.append(item.buffer, { name: item.filename }));
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
