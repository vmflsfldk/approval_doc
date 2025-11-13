const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_EXPORT_NAME = 'HIWORKS_DATA';
const INFO_FILE = 'data_info.js';
const INFO_EXPORT_NAME = 'BACKUP_INFO';
const DATA_FILE_PATTERN = /^data\d+\.js$/;
const MAX_PER_PAGE = 100;

const cachedChunks = new Map();

let cachedInfo = null;
let cachedChunkList = null;

function discoverDataChunks() {
  if (!cachedChunkList) {
    const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
    cachedChunkList = entries
      .filter((entry) => entry.isFile() && DATA_FILE_PATTERN.test(entry.name) && entry.name !== INFO_FILE)
      .map((entry) => entry.name)
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)[0], 10);
        const numB = parseInt(b.match(/\d+/)[0], 10);
        return numA - numB;
      });
  }

  return cachedChunkList;
}

function readDataset(filename, exportName) {
  if (cachedChunks.has(filename)) {
    return cachedChunks.get(filename);
  }

  const filePath = path.join(DATA_DIR, filename);
  const scriptContent = fs.readFileSync(filePath, 'utf-8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(scriptContent, context, { filename: filePath });

  if (!(exportName in context)) {
    throw new Error(`Expected ${exportName} to be defined in ${filename}`);
  }

  const dataset = context[exportName];
  cachedChunks.set(filename, dataset);
  return dataset;
}

function getBackupInfo() {
  if (!cachedInfo) {
    cachedInfo = readDataset(INFO_FILE, INFO_EXPORT_NAME);
  }
  return cachedInfo;
}

function normalisePerPage(perPage) {
  if (!Number.isFinite(perPage) || perPage <= 0) {
    return 10;
  }
  return Math.max(1, Math.min(MAX_PER_PAGE, Math.floor(perPage)));
}

function normalisePage(page) {
  if (!Number.isFinite(page) || page <= 0) {
    return 1;
  }
  return Math.max(1, Math.floor(page));
}

function normaliseString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toLower(value) {
  return normaliseString(value).toLowerCase();
}

function matchesSearchWord(doc, word) {
  if (!word) {
    return true;
  }

  const lowerWord = word.toLowerCase();
  const fields = [doc.document_code, doc.title, doc.user_name, doc.node_name];
  return fields.some((field) => toLower(field).includes(lowerWord));
}

function matchesDrafter(doc, drafter) {
  if (!drafter) {
    return true;
  }

  return toLower(doc.user_name).includes(drafter.toLowerCase());
}

function matchesDateRange(doc, startDate, endDate) {
  if (!startDate && !endDate) {
    return true;
  }

  const regDate = normaliseString(doc.regdate).substring(0, 10);
  if (!regDate) {
    return false;
  }

  if (startDate && regDate < startDate) {
    return false;
  }

  if (endDate && regDate > endDate) {
    return false;
  }

  return true;
}

function matchesUser(doc, { isAdmin, userName }) {
  if (isAdmin) {
    return true;
  }

  const docName = normaliseString(doc && doc.user_name);
  const targetName = normaliseString(userName);
  if (!docName || !targetName) {
    return false;
  }

  return docName === targetName;
}

function passesFilters(doc, filters, userContext) {
  if (!doc || typeof doc !== 'object') {
    return false;
  }

  if (!matchesUser(doc, userContext)) {
    return false;
  }

  if (!matchesSearchWord(doc, filters.searchWord)) {
    return false;
  }

  if (!matchesDrafter(doc, filters.searchDrafter)) {
    return false;
  }

  if (!matchesDateRange(doc, filters.startDate, filters.endDate)) {
    return false;
  }

  return true;
}

function collectDocuments(offset, perPage, filters, userContext) {
  const chunkFiles = discoverDataChunks();
  const documents = [];
  let totalMatches = 0;

  chunkFiles.forEach((file) => {
    const chunk = readDataset(file, DATA_EXPORT_NAME);
    if (!Array.isArray(chunk)) {
      throw new Error(`Chunk ${file} did not export an array`);
    }

    for (let i = 0; i < chunk.length; i += 1) {
      const doc = chunk[i];
      if (!passesFilters(doc, filters, userContext)) {
        continue;
      }

      if (totalMatches >= offset && documents.length < perPage) {
        documents.push(doc);
      }

      totalMatches += 1;
    }
  });

  return { documents, totalMatches };
}

function queryDocuments({
  page = 1,
  perPage = 10,
  filters = {},
  isAdmin = false,
  userName = '',
}) {
  const safePerPage = normalisePerPage(perPage);
  const safePage = normalisePage(page);
  const offset = (safePage - 1) * safePerPage;

  const filterBag = {
    searchWord: normaliseString(filters.searchWord).toLowerCase(),
    searchDrafter: normaliseString(filters.searchDrafter).toLowerCase(),
    startDate: normaliseString(filters.startDate),
    endDate: normaliseString(filters.endDate),
  };

  const userContext = { isAdmin: Boolean(isAdmin), userName };

  let { documents, totalMatches } = collectDocuments(offset, safePerPage, filterBag, userContext);

  if (totalMatches === 0) {
    return { documents, total: 0, page: 1, perPage: safePerPage };
  }

  const totalPages = Math.max(1, Math.ceil(totalMatches / safePerPage));
  let normalizedPage = safePage;

  if (offset >= totalMatches) {
    normalizedPage = totalPages;
    const normalizedOffset = (normalizedPage - 1) * safePerPage;
    ({ documents } = collectDocuments(normalizedOffset, safePerPage, filterBag, userContext));
  }

  return {
    documents,
    total: totalMatches,
    page: normalizedPage,
    perPage: safePerPage,
  };
}

function clearDatasetCache() {
  cachedChunks.clear();
  cachedInfo = null;
  cachedChunkList = null;
}

module.exports = {
  getBackupInfo,
  queryDocuments,
  clearDatasetCache,
};
