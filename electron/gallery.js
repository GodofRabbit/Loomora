const {
  app,
  ipcMain,
  dialog,
  clipboard,
  nativeImage,
  shell,
} = require('electron');
const path = require('path');
const fs = require('fs');

const APP_ROOT = path.resolve(__dirname, '..');
const IMAGE_PATTERN = /\.(png|jpe?g|webp)$/i;
const CONVERSATION_FILE = 'conversations.json';
const OCR_MODEL_FILES = new Set([
  'detection/model.json',
  'detection/chunk_1.dat',
  'recognition/model.json',
  'recognition/chunk_1.dat',
  'recognition/chunk_2.dat',
]);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const JPEG_EXTENSIONS = new Set(['.jpg', '.jpeg']);

const USER_ERROR_RULES = [
  [
    /invalid api key|api key.*invalid|unauthorized|forbidden/i,
    'API 密钥无效或权限不足',
  ],
  [/rate limit|too many requests/i, '请求过于频繁，请稍后重试'],
  [/timed? out|timeout/i, '请求超时，请稍后重试'],
  [
    /failed to fetch|fetch failed|network|socket|dns|econnrefused|enotfound|econnreset/i,
    '网络连接异常，请检查网络后重试',
  ],
  [/invalid url/i, '接口地址无效，请检查后重试'],
  [/model.*not found|unsupported model/i, '所选模型不可用'],
  [/content policy|policy violation/i, '提示词未通过安全检查'],
  [/no such file|file not found/i, '文件不存在'],
  [/abort|cancel/i, '操作已取消'],
];

function galleryRoots() {
  const executableGallery = path.resolve(
    app.isPackaged ? path.dirname(process.execPath) : APP_ROOT,
    'Gallery',
  );
  const userDataGallery = path.resolve(app.getPath('userData'), 'Gallery');
  return app.isPackaged && process.platform === 'darwin'
    ? [userDataGallery, executableGallery]
    : [executableGallery, userDataGallery];
}

function galleryDir() {
  const date = new Date().toLocaleDateString('en-CA');
  return galleryDateDir(date);
}

function galleryDateDir(date) {
  const normalizedDate = String(date || '').match(/^\d{4}-\d{2}-\d{2}$/)
    ? String(date)
    : new Date().toLocaleDateString('en-CA');
  let directory = path.join(galleryRoots()[0], normalizedDate);
  try {
    fs.mkdirSync(directory, { recursive: true });
  } catch {
    // Installed applications may not be allowed to write beside the executable.
    directory = path.join(galleryRoots()[1], normalizedDate);
    fs.mkdirSync(directory, { recursive: true });
  }
  return directory;
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return Boolean(
    relative && !relative.startsWith(`..${path.sep}`) && relative !== '..',
  );
}

function isGalleryImage(filePath) {
  const target = path.resolve(filePath || '');
  return (
    IMAGE_PATTERN.test(target) &&
    galleryRoots().some((root) => isInside(root, target))
  );
}

function sameFilePath(left, right) {
  const a = path.resolve(left || '');
  const b = path.resolve(right || '');
  return process.platform === 'win32'
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

function mimeFromPath(filePath) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  if (extension === 'jpg') return 'image/jpeg';
  return `image/${extension}`;
}

function galleryItem(filePath, buffer = fs.readFileSync(filePath)) {
  const stat = fs.statSync(filePath);
  return {
    name: path.basename(filePath),
    date: path.basename(path.dirname(filePath)),
    path: filePath,
    data: `data:${mimeFromPath(filePath)};base64,${buffer.toString('base64')}`,
    createdAt: stat.mtimeMs,
  };
}

function dateFromTime(value) {
  const time = Number(value) || Date.now();
  return new Date(time).toLocaleDateString('en-CA');
}

function conversationFilePath(directory) {
  return path.join(directory, CONVERSATION_FILE);
}

function readConversationFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed?.turns) ? parsed.turns : [];
  } catch {
    return [];
  }
}

function writeConversationFile(filePath, turns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    turns,
  };
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function conversationDirectory(turn) {
  const folderValue = String(turn?.folder || '').trim();
  const folder = folderValue ? path.resolve(folderValue) : '';
  if (
    folder &&
    galleryRoots().some((root) => {
      const relative = path.relative(root, folder);
      return (
        relative && !relative.startsWith(`..${path.sep}`) && relative !== '..'
      );
    })
  ) {
    return folder;
  }
  return galleryDateDir(dateFromTime(turn?.createdAt));
}

function sanitizeConversationTurn(turn = {}) {
  const imagePaths = Array.isArray(turn.imagePaths)
    ? turn.imagePaths.map((item) => String(item || '')).filter(Boolean)
    : [];
  const createdAt = Number(turn.createdAt) || Date.now();
  return {
    id: String(turn.id || `turn-${createdAt}`),
    createdAt,
    completedAt: Number(turn.completedAt) || null,
    prompt: String(turn.prompt || ''),
    model: String(turn.model || ''),
    ratio: String(turn.ratio || ''),
    resolution: String(turn.resolution || ''),
    quality: String(turn.quality || ''),
    outputFormat: String(turn.outputFormat || ''),
    count: Math.max(1, Number(turn.count) || imagePaths.length || 1),
    referenceCount: Math.max(0, Number(turn.referenceCount) || 0),
    mode: turn.mode === 'batch' ? 'batch' : 'stream',
    status: ['running', 'done', 'error', 'cancelled'].includes(turn.status)
      ? turn.status
      : 'done',
    message: String(turn.message || ''),
    imagePaths,
    progress: {
      batchIndex: Math.max(0, Number(turn.progress?.batchIndex) || 0),
      total: Math.max(0, Number(turn.progress?.total) || 0),
      completed: Math.max(
        0,
        Number(turn.progress?.completed) || imagePaths.length,
      ),
      failed: Math.max(0, Number(turn.progress?.failed) || 0),
      partial: Math.max(0, Number(turn.progress?.partial) || 0),
    },
    folder: String(turn.folder || ''),
    error: String(turn.error || ''),
  };
}

function saveConversationTurn(turn) {
  const sanitized = sanitizeConversationTurn(turn);
  const directory = conversationDirectory(sanitized);
  if (!sanitized.folder) sanitized.folder = directory;
  const filePath = conversationFilePath(directory);
  const turns = readConversationFile(filePath);
  const index = turns.findIndex((item) => item?.id === sanitized.id);
  if (index >= 0) turns[index] = sanitized;
  else turns.push(sanitized);
  turns.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
  writeConversationFile(filePath, turns);
  return { saved: true, path: filePath, turn: sanitized };
}

function hydrateConversationTurn(turn) {
  const sanitized = sanitizeConversationTurn(turn);
  const images = [];
  const imagePaths = [];
  sanitized.imagePaths.forEach((filePath) => {
    const target = path.resolve(filePath || '');
    if (!isGalleryImage(target) || !fs.existsSync(target)) return;
    const buffer = fs.readFileSync(target);
    images.push(
      `data:${mimeFromPath(target)};base64,${buffer.toString('base64')}`,
    );
    imagePaths.push(target);
  });
  return {
    ...sanitized,
    imagePaths,
    images,
    liveImage: '',
  };
}

function collectConversationTurns() {
  const records = [];
  const seen = new Set();
  for (const root of new Set(galleryRoots())) {
    if (!fs.existsSync(root)) continue;
    const dateDirectories = fs.readdirSync(root, { withFileTypes: true });
    for (const dateDirectory of dateDirectories) {
      if (!dateDirectory.isDirectory()) continue;
      const filePath = conversationFilePath(
        path.join(root, dateDirectory.name),
      );
      for (const turn of readConversationFile(filePath)) {
        const sanitized = sanitizeConversationTurn(turn);
        if (!sanitized.id || seen.has(sanitized.id)) continue;
        seen.add(sanitized.id);
        records.push(sanitized);
      }
    }
  }
  return records.sort(
    (a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0),
  );
}

function listConversationHistory(options = {}) {
  const allRecords = collectConversationTurns();
  const limit = Math.min(50, Math.max(1, Number(options?.limit) || 10));
  const offset = Math.min(
    Math.max(0, Number(options?.offset) || 0),
    Math.max(0, allRecords.length - 1),
  );
  const items = allRecords
    .slice(offset, offset + limit)
    .map(hydrateConversationTurn)
    .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
  return {
    items,
    total: allRecords.length,
    offset,
    limit,
    hasMore: offset + limit < allRecords.length,
    hasNewer: offset > 0,
  };
}

function findConversationByImage(filePath) {
  const target = path.resolve(filePath || '');
  if (!isGalleryImage(target)) return null;
  const historyPath = conversationFilePath(path.dirname(target));
  const turns = readConversationFile(historyPath);
  const turn = turns.find((item) =>
    (Array.isArray(item?.imagePaths) ? item.imagePaths : []).some((itemPath) =>
      sameFilePath(itemPath, target),
    ),
  );
  return turn ? sanitizeConversationTurn(turn) : null;
}

function deleteConversationTurn(turnId) {
  const targetId = String(turnId || '').trim();
  if (!targetId) return { deleted: false };
  let deleted = false;
  for (const root of new Set(galleryRoots())) {
    if (!fs.existsSync(root)) continue;
    for (const dateDirectory of fs.readdirSync(root, { withFileTypes: true })) {
      if (!dateDirectory.isDirectory()) continue;
      const filePath = conversationFilePath(
        path.join(root, dateDirectory.name),
      );
      const turns = readConversationFile(filePath);
      if (!turns.length) continue;
      const nextTurns = turns.filter(
        (turn) => String(turn?.id || '') !== targetId,
      );
      if (nextTurns.length === turns.length) continue;
      writeConversationFile(filePath, nextTurns);
      deleted = true;
    }
  }
  return { deleted };
}

function updateStoredConversationImagePath(oldPath, nextPath) {
  const oldTarget = path.resolve(oldPath || '');
  const nextTarget = path.resolve(nextPath || '');
  for (const root of new Set(galleryRoots())) {
    if (!fs.existsSync(root)) continue;
    for (const dateDirectory of fs.readdirSync(root, { withFileTypes: true })) {
      if (!dateDirectory.isDirectory()) continue;
      const filePath = conversationFilePath(
        path.join(root, dateDirectory.name),
      );
      const turns = readConversationFile(filePath);
      let fileChanged = false;
      const nextTurns = turns.map((turn) => {
        const paths = Array.isArray(turn.imagePaths) ? turn.imagePaths : [];
        let turnChanged = false;
        const imagePaths = paths.map((itemPath) => {
          if (!sameFilePath(itemPath, oldTarget)) return itemPath;
          turnChanged = true;
          fileChanged = true;
          return nextTarget;
        });
        return turnChanged ? { ...turn, imagePaths } : turn;
      });
      if (fileChanged) writeConversationFile(filePath, nextTurns);
    }
  }
}

function removeStoredConversationImagePath(filePath) {
  const target = path.resolve(filePath || '');
  for (const root of new Set(galleryRoots())) {
    if (!fs.existsSync(root)) continue;
    for (const dateDirectory of fs.readdirSync(root, { withFileTypes: true })) {
      if (!dateDirectory.isDirectory()) continue;
      const historyPath = conversationFilePath(
        path.join(root, dateDirectory.name),
      );
      const turns = readConversationFile(historyPath);
      let fileChanged = false;
      const nextTurns = turns.map((turn) => {
        const paths = Array.isArray(turn.imagePaths) ? turn.imagePaths : [];
        let turnChanged = false;
        const imagePaths = paths.filter((itemPath) => {
          const keep = !sameFilePath(itemPath, target);
          if (!keep) {
            turnChanged = true;
            fileChanged = true;
          }
          return keep;
        });
        if (!turnChanged) return turn;
        return {
          ...turn,
          imagePaths,
          progress: {
            ...(turn.progress || {}),
            completed: Math.min(
              Number(turn.progress?.completed) || imagePaths.length,
              imagePaths.length,
            ),
          },
        };
      });
      if (fileChanged) writeConversationFile(historyPath, nextTurns);
    }
  }
}

function formatUserError(value, fallback = '操作失败，请稍后重试') {
  const raw =
    typeof value === 'string'
      ? value
      : value?.message || value?.error?.message || '';
  const message = String(raw).trim();
  if (!message) return fallback;
  if (/[\u3400-\u9fff]/.test(message)) return message;
  const lower = message.toLowerCase();
  for (const [rule, text] of USER_ERROR_RULES) {
    if (rule.test(lower)) return text;
  }
  return fallback;
}

function listGallery() {
  const files = [];
  for (const root of new Set(galleryRoots())) {
    if (!fs.existsSync(root)) continue;
    const dateDirectories = fs.readdirSync(root, { withFileTypes: true });
    for (const dateDirectory of dateDirectories) {
      if (!dateDirectory.isDirectory()) continue;
      const directory = path.join(root, dateDirectory.name);
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isFile() || !IMAGE_PATTERN.test(entry.name)) continue;
        files.push(galleryItem(path.join(directory, entry.name)));
      }
    }
  }
  return files.sort(
    (a, b) =>
      String(b.date).localeCompare(String(a.date)) ||
      b.createdAt - a.createdAt ||
      b.name.localeCompare(a.name),
  );
}

function availableImportPath(directory, fileName) {
  const parsed = path.parse(path.basename(fileName));
  let candidate = path.join(directory, `${parsed.name}${parsed.ext}`);
  for (let suffix = 1; fs.existsSync(candidate); suffix++) {
    candidate = path.join(directory, `${parsed.name}-${suffix}${parsed.ext}`);
  }
  return candidate;
}

function availableExportFolder(parentDirectory, folderName) {
  let candidate = path.join(parentDirectory, folderName);
  for (let suffix = 1; fs.existsSync(candidate); suffix++) {
    candidate = path.join(parentDirectory, `${folderName}-${suffix}`);
  }
  return candidate;
}

function availableExportPath(directory, fileName) {
  const parsed = path.parse(path.basename(fileName));
  let candidate = path.join(directory, `${parsed.name}${parsed.ext}`);
  for (let suffix = 1; fs.existsSync(candidate); suffix++) {
    candidate = path.join(directory, `${parsed.name}-${suffix}${parsed.ext}`);
  }
  return candidate;
}

function sanitizeFolderName(value) {
  return String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '');
}

function formatExportTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function normalizeRenameTarget(sourcePath, requestedName) {
  const source = path.resolve(sourcePath || '');
  const sourceExt = path.extname(source).toLowerCase();
  const candidate = path
    .basename(String(requestedName || '').trim())
    .replace(/[. ]+$/g, '');
  if (!candidate) throw new Error('请输入新的文件名');
  if (/[<>:"/\\|?*\u0000-\u001F]/.test(candidate)) {
    throw new Error('文件名不能包含 \\ / : * ? " < > | 等字符');
  }
  const parsed = path.parse(candidate);
  if (!parsed.name) throw new Error('请输入新的文件名');
  const rawExt =
    parsed.ext && parsed.ext !== '.' ? parsed.ext.toLowerCase() : '';
  if (rawExt && !IMAGE_EXTENSIONS.has(rawExt)) {
    throw new Error(
      '文件后缀只支持 PNG、JPG、JPEG、WEBP；如果不想改后缀，请把后缀删掉',
    );
  }
  const requestedExt = rawExt;
  const baseName = requestedExt ? parsed.name : candidate;
  let nextExt = sourceExt;
  if (requestedExt) {
    if (requestedExt === sourceExt) {
      nextExt = sourceExt;
    } else if (
      JPEG_EXTENSIONS.has(requestedExt) &&
      JPEG_EXTENSIONS.has(sourceExt)
    ) {
      nextExt = requestedExt;
    } else {
      throw new Error('后缀与原图片格式不一致，请删除后缀或保持与原图一致');
    }
  }
  return {
    sourcePath: source,
    targetPath: path.join(path.dirname(source), `${baseName}${nextExt}`),
  };
}

function importGalleryFiles(filePaths) {
  const directory = galleryDir();
  const items = [];
  const failed = [];
  for (const inputPath of filePaths) {
    const sourcePath = path.resolve(String(inputPath || ''));
    try {
      if (
        !IMAGE_PATTERN.test(sourcePath) ||
        !fs.statSync(sourcePath).isFile()
      ) {
        throw new Error('仅支持 JPG、PNG 和 WEBP 图片');
      }
      if (nativeImage.createFromPath(sourcePath).isEmpty()) {
        throw new Error('图片文件无效或已损坏');
      }
      const targetPath = availableImportPath(
        directory,
        path.basename(sourcePath),
      );
      fs.copyFileSync(sourcePath, targetPath);
      const importedAt = new Date();
      fs.utimesSync(targetPath, importedAt, importedAt);
      items.push(galleryItem(targetPath));
    } catch (error) {
      failed.push({
        name: path.basename(sourcePath) || '未知文件',
        error: formatUserError(error, '导入失败'),
      });
    }
  }
  return { canceled: false, items, failed };
}

function requestHeaders(key) {
  return { Authorization: `Bearer ${key}` };
}

async function downloadRemoteImage(url, key) {
  const response = await fetch(url, { headers: requestHeaders(key) });
  if (!response.ok) throw new Error(`下载图片失败（${response.status}）`);
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mime: response.headers.get('content-type')?.split(';')[0],
  };
}

async function saveGeneratedImages(items, { key, outputFormat = 'png' }) {
  const directory = galleryDir();
  const images = [];
  const localPaths = [];
  const total = items.length;

  for (let index = 0; index < total; index++) {
    const item = items[index] || {};
    let buffer;
    const fallbackMime =
      outputFormat === 'jpeg'
        ? 'image/jpeg'
        : outputFormat === 'webp'
          ? 'image/webp'
          : 'image/png';
    let mime = item.mime_type || fallbackMime;
    const base64 = item.b64_json || item.base64;
    const url = item.url || item.image_url;

    if (base64) {
      buffer = Buffer.from(base64.replace(/^data:[^,]+,/, ''), 'base64');
    } else if (url) {
      const downloaded = await downloadRemoteImage(url, key);
      buffer = downloaded.buffer;
      mime =
        downloaded.mime ||
        (/\.jpe?g(?:\?|$)/i.test(url)
          ? 'image/jpeg'
          : /\.webp(?:\?|$)/i.test(url)
            ? 'image/webp'
            : fallbackMime);
    } else {
      continue;
    }

    const extension = mime.includes('jpeg')
      ? 'jpg'
      : mime.includes('webp')
        ? 'webp'
        : 'png';
    const filePath = path.join(
      directory,
      `loomora-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${index + 1}.${extension}`,
    );
    fs.writeFileSync(filePath, buffer);
    localPaths.push(filePath);
    images.push(`data:${mime};base64,${buffer.toString('base64')}`);
  }

  return { images, localPaths, folder: directory };
}

function registerGalleryHandlers() {
  ipcMain.handle('pick-image', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    return {
      name: path.basename(filePath),
      data: `data:${mimeFromPath(filePath)};base64,${fs.readFileSync(filePath).toString('base64')}`,
    };
  });

  ipcMain.handle('list-gallery', async () => listGallery());

  ipcMain.handle('list-conversation-history', async (_event, options) =>
    listConversationHistory(options),
  );

  ipcMain.handle('save-conversation-turn', async (_event, turn) =>
    saveConversationTurn(turn),
  );

  ipcMain.handle('find-conversation-by-image', async (_event, filePath) =>
    findConversationByImage(filePath),
  );

  ipcMain.handle('delete-conversation-turn', async (_event, turnId) =>
    deleteConversationTurn(turnId),
  );

  ipcMain.handle('import-gallery-images', async (_event, filePaths) => {
    let selectedPaths = filePaths;
    if (!Array.isArray(selectedPaths)) {
      const result = await dialog.showOpenDialog({
        title: '导入图片到作品库',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      });
      if (result.canceled || !result.filePaths.length) {
        return { canceled: true, items: [], failed: [] };
      }
      selectedPaths = result.filePaths;
    }
    return importGalleryFiles(selectedPaths);
  });

  ipcMain.handle('export-gallery-images', async (_event, payload) => {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (!items.length) {
      return { canceled: false, exported: 0, folder: '', failed: [] };
    }
    const parent = await dialog.showOpenDialog({
      title: '选择导出位置',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (parent.canceled || !parent.filePaths[0]) {
      return { canceled: true, exported: 0, folder: '', failed: [] };
    }

    const scope = payload?.scope === 'selected' ? 'selected' : 'current';
    const date = String(payload?.date || '').trim();
    const folderBase = sanitizeFolderName(
      scope === 'current' && date && date !== 'all'
        ? `Loomora-${date}`
        : `Loomora-批量导出-${formatExportTimestamp()}`,
    );
    const exportDir = availableExportFolder(parent.filePaths[0], folderBase);
    fs.mkdirSync(exportDir, { recursive: true });

    const failed = [];
    let exported = 0;
    for (const item of items) {
      try {
        const sourcePath = path.resolve(item?.path || item?.filePath || '');
        if (!isGalleryImage(sourcePath) || !fs.existsSync(sourcePath)) {
          throw new Error('图片文件不存在');
        }
        const targetPath = availableExportPath(
          exportDir,
          item?.name || path.basename(sourcePath),
        );
        fs.copyFileSync(sourcePath, targetPath);
        exported += 1;
      } catch (error) {
        failed.push({
          name: String(item?.name || '未知文件'),
          error: formatUserError(error, '导出失败'),
        });
      }
    }

    return {
      canceled: false,
      exported,
      folder: exportDir,
      failed,
    };
  });

  ipcMain.handle('copy-image', async (_event, source) => {
    const image = nativeImage.createFromDataURL(source);
    if (image.isEmpty()) throw new Error('无法复制图片');
    clipboard.writeImage(image);
    return true;
  });

  ipcMain.handle('copy-text', async (_event, text) => {
    clipboard.writeText(String(text || ''));
    return true;
  });

  ipcMain.handle('read-ocr-model', async (_event, relativePath) => {
    const normalized = String(relativePath || '').replace(/\\/g, '/');
    if (!OCR_MODEL_FILES.has(normalized)) {
      throw new Error('无效的 OCR 模型文件');
    }
    const rendererRoot = process.env.VITE_DEV_SERVER_URL
      ? path.join(APP_ROOT, 'renderer', 'public')
      : path.join(APP_ROOT, 'renderer-dist');
    return fs.readFileSync(
      path.join(rendererRoot, 'models', 'ocr', ...normalized.split('/')),
    );
  });

  ipcMain.handle('download-image', async (_event, payload) => {
    const sourcePath = path.resolve(payload?.filePath || '');
    let buffer;
    let extension = 'png';
    if (isGalleryImage(sourcePath) && fs.existsSync(sourcePath)) {
      buffer = fs.readFileSync(sourcePath);
      extension = path.extname(sourcePath).slice(1).toLowerCase() || 'png';
    } else {
      const dataUrl = String(payload?.src || '');
      if (
        !dataUrl.startsWith('data:image/') ||
        dataUrl.length > 140 * 1024 * 1024
      ) {
        throw new Error('图片数据无效');
      }
      const image = nativeImage.createFromDataURL(dataUrl);
      if (image.isEmpty()) throw new Error('图片数据无效');
      const mime = dataUrl.match(/^data:image\/(png|jpeg|webp)/i)?.[1];
      if (mime === 'jpeg') {
        buffer = image.toJPEG(95);
        extension = 'jpg';
      } else {
        buffer = image.toPNG();
      }
    }

    const requestedName = path.basename(String(payload?.name || ''));
    const defaultName = requestedName
      ? `${path.basename(requestedName, path.extname(requestedName))}.${extension}`
      : `loomora-${Date.now()}.${extension}`;
    const result = await dialog.showSaveDialog({
      title: '保存图片',
      defaultPath: path.join(app.getPath('pictures'), defaultName),
      filters: [
        {
          name: extension === 'jpg' ? 'JPEG 图片' : 'PNG 图片',
          extensions: [extension],
        },
      ],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    const targetPath = path.extname(result.filePath)
      ? result.filePath
      : `${result.filePath}.${extension}`;
    fs.writeFileSync(targetPath, buffer);
    return { saved: true, path: targetPath };
  });

  ipcMain.handle('save-edited-image', async (_event, payload) => {
    const sourcePath = path.resolve(payload?.sourcePath || '');
    if (!isGalleryImage(sourcePath) || !fs.existsSync(sourcePath)) {
      throw new Error('作品图片路径无效');
    }
    const dataUrl = String(payload?.dataUrl || '');
    if (
      !dataUrl.startsWith('data:image/') ||
      dataUrl.length > 140 * 1024 * 1024
    ) {
      throw new Error('编辑后的图片数据无效');
    }
    const editedImage = nativeImage.createFromDataURL(dataUrl);
    if (editedImage.isEmpty()) throw new Error('编辑后的图片数据无效');
    const buffer = editedImage.toPNG();
    if (!buffer.length || buffer.length > 100 * 1024 * 1024) {
      throw new Error('编辑后的图片为空或过大');
    }

    const stem = path.basename(sourcePath, path.extname(sourcePath));
    const result = await dialog.showSaveDialog({
      title: '另存为新图',
      defaultPath: path.join(galleryDir(), `${stem}-edited-${Date.now()}.png`),
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    const targetPath = path.extname(result.filePath)
      ? result.filePath
      : `${result.filePath}.png`;
    fs.writeFileSync(targetPath, buffer);

    // Only persistent gallery locations should appear in the in-memory gallery.
    const parentRoot = path.resolve(path.dirname(path.dirname(targetPath)));
    const isInGalleryDateDirectory = galleryRoots().some(
      (root) => path.relative(root, parentRoot) === '',
    );
    return {
      saved: true,
      path: targetPath,
      item: isInGalleryDateDirectory ? galleryItem(targetPath, buffer) : null,
    };
  });

  ipcMain.handle('delete-image', async (_event, filePath) => {
    const target = path.resolve(filePath || '');
    if (!isGalleryImage(target)) throw new Error('作品图片路径无效');
    if (!fs.existsSync(target)) return { deleted: false };
    const confirmation = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['删除', '取消'],
      defaultId: 1,
      cancelId: 1,
      title: '删除图片',
      message: '确定要永久删除这张图片吗？',
      detail: path.basename(target),
    });
    if (confirmation.response !== 0) return { deleted: false };
    fs.unlinkSync(target);
    removeStoredConversationImagePath(target);
    return { deleted: true };
  });

  ipcMain.handle('rename-image', async (_event, payload) => {
    try {
      const sourcePath = path.resolve(payload?.filePath || '');
      if (!isGalleryImage(sourcePath)) {
        return { renamed: false, error: '作品图片路径无效' };
      }
      if (!fs.existsSync(sourcePath)) {
        return { renamed: false, error: '图片文件不存在' };
      }
      const { sourcePath: source, targetPath } = normalizeRenameTarget(
        sourcePath,
        payload?.name,
      );
      if (sameFilePath(source, targetPath)) {
        return {
          renamed: false,
          path: sourcePath,
          item: galleryItem(sourcePath),
          message: '新文件名和原文件名相同，不需要修改',
        };
      }
      if (fs.existsSync(targetPath)) {
        return { renamed: false, error: '同名文件已存在，请换一个名字' };
      }
      fs.renameSync(sourcePath, targetPath);
      updateStoredConversationImagePath(sourcePath, targetPath);
      return {
        renamed: true,
        oldPath: sourcePath,
        path: targetPath,
        item: galleryItem(targetPath),
      };
    } catch (error) {
      return {
        renamed: false,
        error: formatUserError(error, '重命名失败，请稍后重试'),
      };
    }
  });

  ipcMain.handle('show-image-in-folder', async (_event, filePath) => {
    const target = path.resolve(filePath || '');
    if (!fs.existsSync(target)) throw new Error('图片文件不存在');
    shell.showItemInFolder(target);
    return true;
  });

  ipcMain.handle('open-folder', async (_event, folderPath) => {
    const target = path.resolve(folderPath || '');
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
      throw new Error('文件夹不存在');
    }
    const error = await shell.openPath(target);
    if (error) {
      shell.showItemInFolder(target);
    }
    return true;
  });
}

module.exports = { registerGalleryHandlers, saveGeneratedImages };
