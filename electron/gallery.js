const {
  app,
  ipcMain,
  dialog,
  clipboard,
  nativeImage,
  shell,
  protocol,
  net,
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const {
  clearFavoriteData,
  favoriteState,
  moveFavorite,
  pruneMissingFavorites,
  removeFavorites,
  setFavorite,
} = require('./galleryFavorites');
const {
  clearImageMetadataData,
  imageMetadataFacets,
  imageMetadataState,
  inheritImageMetadata,
  moveImageMetadata,
  matchingMetadataPaths,
  metadataVersions,
  pruneMissingImageMetadata,
  removeImageMetadata,
  setConversationImageMetadata,
  setImageHashes,
  updateImageMetadata,
} = require('./galleryMetadata');
const {
  clearTrashData,
  deleteTrashItems,
  emptyTrash,
  isTrashImage,
  listTrash,
  moveImageToTrash,
  restoreTrashItem,
} = require('./galleryTrash');

const APP_ROOT = path.resolve(__dirname, '..');
const IMAGE_PATTERN = /\.(png|jpe?g|webp)$/i;
const CONVERSATION_FILE = 'conversations.json';
const CONVERSATION_REFERENCE_DIRECTORY = '.references';
const OCR_MODEL_FILES = new Set([
  'detection/model.json',
  'detection/chunk_1.dat',
  'recognition/model.json',
  'recognition/chunk_1.dat',
  'recognition/chunk_2.dat',
]);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const JPEG_EXTENSIONS = new Set(['.jpg', '.jpeg']);
const GALLERY_SCHEME = 'loomora-gallery';
const STORAGE_SETTINGS_FILE = 'storage-settings.json';
const GALLERY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
let configuredGalleryRoot;
let knownGalleryRoots = [];
let storageSettingsLoaded = false;

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
  [/permission denied|eacces|eperm/i, '没有删除权限，请检查文件权限'],
  [/abort|cancel/i, '操作已取消'],
];

function defaultGalleryRoots() {
  const executableGallery = path.resolve(
    app.isPackaged ? path.dirname(process.execPath) : APP_ROOT,
    'Gallery',
  );
  const userDataGallery = path.resolve(app.getPath('userData'), 'Gallery');
  return app.isPackaged && process.platform === 'darwin'
    ? [userDataGallery, executableGallery]
    : [executableGallery, userDataGallery];
}

function storageSettingsPath() {
  return path.join(app.getPath('userData'), STORAGE_SETTINGS_FILE);
}

function loadConfiguredGalleryRoot() {
  if (storageSettingsLoaded) return configuredGalleryRoot;
  storageSettingsLoaded = true;
  try {
    const settings = JSON.parse(fs.readFileSync(storageSettingsPath(), 'utf8'));
    const directory = String(settings?.galleryDirectory || '').trim();
    configuredGalleryRoot = directory ? path.resolve(directory) : undefined;
    knownGalleryRoots = Array.isArray(settings?.knownDirectories)
      ? settings.knownDirectories
          .map((item) => String(item || '').trim())
          .filter(Boolean)
          .map((item) => path.resolve(item))
      : [];
  } catch {
    configuredGalleryRoot = undefined;
    knownGalleryRoots = [];
  }
  return configuredGalleryRoot;
}

function galleryRoots() {
  const customRoot = loadConfiguredGalleryRoot();
  const defaults = defaultGalleryRoots();
  const primaryRoot = customRoot || defaults[0];
  return Array.from(
    new Set([primaryRoot, ...knownGalleryRoots, ...defaults].filter(Boolean)),
  );
}

function currentGalleryRoot() {
  return galleryRoots()[0];
}

function galleryStorageSettings() {
  const defaults = defaultGalleryRoots();
  return {
    directory: currentGalleryRoot(),
    defaultDirectory: defaults[0],
    custom: Boolean(loadConfiguredGalleryRoot()),
  };
}

function saveConfiguredGalleryRoot(directory) {
  const normalized = String(directory || '').trim();
  const nextRoot = normalized ? path.resolve(normalized) : undefined;
  const nextKnownRoots = Array.from(
    new Set(
      [configuredGalleryRoot, nextRoot, ...knownGalleryRoots].filter(Boolean),
    ),
  );
  if (nextRoot) {
    fs.mkdirSync(nextRoot, { recursive: true });
    if (!fs.statSync(nextRoot).isDirectory()) {
      throw new Error('所选作品存储位置不是文件夹');
    }
  }
  const filePath = storageSettingsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(
    temporaryPath,
    `${JSON.stringify(
      {
        galleryDirectory: nextRoot || '',
        knownDirectories: nextKnownRoots,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  fs.renameSync(temporaryPath, filePath);
  configuredGalleryRoot = nextRoot;
  knownGalleryRoots = nextKnownRoots;
  storageSettingsLoaded = true;
  return galleryStorageSettings();
}

function galleryDir() {
  const date = new Date().toLocaleDateString('en-CA');
  return galleryDateDir(date);
}

function galleryDateDir(date) {
  const normalizedDate = String(date || '').match(/^\d{4}-\d{2}-\d{2}$/)
    ? String(date)
    : new Date().toLocaleDateString('en-CA');
  let lastError;
  for (const root of galleryRoots()) {
    const directory = path.join(root, normalizedDate);
    try {
      fs.mkdirSync(directory, { recursive: true });
      return directory;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('无法创建作品存储目录');
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

function isManagedImage(filePath) {
  const target = path.resolve(filePath || '');
  return (
    IMAGE_PATTERN.test(target) &&
    (isGalleryImage(target) || isTrashImage(target))
  );
}

function sameFilePath(left, right) {
  return comparableFilePath(left) === comparableFilePath(right);
}

function comparableFilePath(filePath) {
  const target = path.resolve(filePath || '');
  return process.platform === 'win32' ? target.toLowerCase() : target;
}

function mimeFromPath(filePath) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  if (extension === 'jpg') return 'image/jpeg';
  return `image/${extension}`;
}

function galleryImageUrl(filePath) {
  return `${GALLERY_SCHEME}://image?path=${encodeURIComponent(path.resolve(filePath))}`;
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }
  const sizeMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  let offset = 2;
  while (offset + 8 < buffer.length) {
    while (offset < buffer.length && buffer[offset] !== 0xff) offset += 1;
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    if (sizeMarkers.has(marker) && segmentLength >= 7) {
      return {
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function webpDimensions(buffer) {
  if (
    buffer.length < 30 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }
  const format = buffer.toString('ascii', 12, 16);
  if (format === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (format === 'VP8L' && buffer[20] === 0x2f) {
    return {
      width: 1 + buffer[21] + ((buffer[22] & 0x3f) << 8),
      height:
        1 + (buffer[22] >> 6) + (buffer[23] << 2) + ((buffer[24] & 0x0f) << 10),
    };
  }
  if (
    format === 'VP8 ' &&
    buffer[23] === 0x9d &&
    buffer[24] === 0x01 &&
    buffer[25] === 0x2a
  ) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  return null;
}

function imageDimensions(filePath, fileSize) {
  const extension = path.extname(filePath).toLowerCase();
  const headerSize = Math.min(
    fileSize,
    extension === '.jpg' || extension === '.jpeg' ? 256 * 1024 : 64,
  );
  if (!headerSize) return {};
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(headerSize);
    const bytesRead = fs.readSync(descriptor, buffer, 0, headerSize, 0);
    const header = buffer.subarray(0, bytesRead);
    let dimensions;
    if (
      extension === '.png' &&
      header.length >= 24 &&
      header.toString('hex', 0, 8) === '89504e470d0a1a0a'
    ) {
      dimensions = {
        width: header.readUInt32BE(16),
        height: header.readUInt32BE(20),
      };
    } else if (extension === '.jpg' || extension === '.jpeg') {
      dimensions = jpegDimensions(header);
    } else if (extension === '.webp') {
      dimensions = webpDimensions(header);
    }
    return dimensions?.width && dimensions?.height ? dimensions : {};
  } catch {
    return {};
  } finally {
    fs.closeSync(descriptor);
  }
}

function galleryItem(filePath) {
  const stat = fs.statSync(filePath);
  const metadata = imageMetadataState(filePath);
  return {
    name: path.basename(filePath),
    date: path.basename(path.dirname(filePath)),
    path: filePath,
    data: galleryImageUrl(filePath),
    createdAt: stat.mtimeMs,
    hasPrompt: metadata.hasPrompt,
    title: metadata.title,
    note: metadata.note,
    tags: metadata.tags,
    album: metadata.album,
    colorLabel: metadata.colorLabel,
    version: metadata.version,
    hasVersions: Boolean(metadata.parentPath || metadata.rootPath),
    ...favoriteState(filePath),
    ...imageDimensions(filePath, stat.size),
  };
}

function trashGalleryItem(record) {
  const filePath = path.resolve(record.trashPath);
  const item = galleryItem(filePath);
  return {
    ...item,
    name: record.name || path.basename(record.originalPath),
    date: dateFromTime(record.deletedAt),
    originalDate: path.basename(path.dirname(record.originalPath)),
    trashId: record.id,
    originalPath: record.originalPath,
    deletedAt: Number(record.deletedAt) || 0,
  };
}

function galleryImageData(filePath) {
  const target = path.resolve(filePath || '');
  if (!isGalleryImage(target) || !fs.existsSync(target)) {
    throw new Error('作品图片不存在或路径无效');
  }
  return `data:${mimeFromPath(target)};base64,${fs.readFileSync(target).toString('base64')}`;
}

function registerGalleryScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: GALLERY_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
}

function registerGalleryProtocol() {
  protocol.handle(GALLERY_SCHEME, (request) => {
    try {
      const requestUrl = new URL(request.url);
      const target = path.resolve(requestUrl.searchParams.get('path') || '');
      if (!isManagedImage(target) || !fs.existsSync(target)) {
        return new Response('图片不存在', { status: 404 });
      }
      return net.fetch(pathToFileURL(target).toString());
    } catch {
      return new Response('图片地址无效', { status: 400 });
    }
  });
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
  const referencePaths = Array.isArray(turn.referencePaths)
    ? turn.referencePaths.map((item) => String(item || '')).filter(Boolean)
    : [];
  const referenceNames = Array.isArray(turn.referenceNames)
    ? turn.referenceNames.map((item) => String(item || '参考图'))
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
    referenceCount: Math.max(
      referencePaths.length,
      Number(turn.referenceCount) || 0,
    ),
    referencePaths,
    referenceNames: referencePaths.map(
      (_item, index) => referenceNames[index] || `参考图-${index + 1}`,
    ),
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

function saveConversationReferences(turn, directory, turnId) {
  const references = Array.isArray(turn?.references) ? turn.references : [];
  if (!references.length) {
    return {
      paths: Array.isArray(turn?.referencePaths) ? turn.referencePaths : [],
      names: Array.isArray(turn?.referenceNames) ? turn.referenceNames : [],
    };
  }

  const safeTurnId = sanitizeFolderName(turnId) || `turn-${Date.now()}`;
  const referenceDirectory = path.join(
    directory,
    CONVERSATION_REFERENCE_DIRECTORY,
    safeTurnId,
  );
  fs.rmSync(referenceDirectory, { recursive: true, force: true });
  fs.mkdirSync(referenceDirectory, { recursive: true });

  const paths = [];
  const names = [];
  references.forEach((reference, index) => {
    const data = String(reference?.data || '');
    const match = data.match(
      /^data:image\/(png|jpeg|jpg|webp);base64,([a-z0-9+/=\s]+)$/i,
    );
    if (!match) return;
    const mimeExtension = match[1].toLowerCase();
    const extension = mimeExtension === 'jpeg' ? 'jpg' : mimeExtension;
    const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
    if (!buffer.length) return;
    const originalName = path.basename(
      String(reference?.name || `参考图-${index + 1}.${extension}`),
    );
    const baseName =
      sanitizeFolderName(path.parse(originalName).name) ||
      `参考图-${index + 1}`;
    const filePath = path.join(
      referenceDirectory,
      `${String(index + 1).padStart(2, '0')}-${baseName}.${extension}`,
    );
    fs.writeFileSync(filePath, buffer);
    paths.push(filePath);
    names.push(originalName);
  });
  return { paths, names };
}

function removeConversationReferences(turn) {
  const referencePaths = Array.isArray(turn?.referencePaths)
    ? turn.referencePaths
    : [];
  const referenceDirectory = referencePaths[0]
    ? path.dirname(path.resolve(referencePaths[0]))
    : '';
  if (
    referenceDirectory &&
    path.basename(path.dirname(referenceDirectory)) ===
      CONVERSATION_REFERENCE_DIRECTORY &&
    galleryRoots().some((root) => isInside(root, referenceDirectory))
  ) {
    fs.rmSync(referenceDirectory, { recursive: true, force: true });
  }
}

function saveConversationTurn(turn) {
  const sanitized = sanitizeConversationTurn(turn);
  const directory = conversationDirectory(sanitized);
  if (!sanitized.folder) sanitized.folder = directory;
  const savedReferences = saveConversationReferences(
    turn,
    directory,
    sanitized.id,
  );
  sanitized.referencePaths = savedReferences.paths;
  sanitized.referenceNames = savedReferences.paths.map(
    (_item, index) => savedReferences.names[index] || `参考图-${index + 1}`,
  );
  sanitized.referenceCount = savedReferences.paths.length;
  const filePath = conversationFilePath(directory);
  const turns = readConversationFile(filePath);
  const index = turns.findIndex((item) => item?.id === sanitized.id);
  if (index >= 0) turns[index] = sanitized;
  else turns.push(sanitized);
  turns.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
  writeConversationFile(filePath, turns);
  setConversationImageMetadata(sanitized);
  return { saved: true, path: filePath, turn: sanitized };
}

function hydrateConversationTurn(turn) {
  const sanitized = sanitizeConversationTurn(turn);
  const images = [];
  const imagePaths = [];
  sanitized.imagePaths.forEach((filePath) => {
    const target = path.resolve(filePath || '');
    if (!isGalleryImage(target) || !fs.existsSync(target)) return;
    images.push(galleryImageUrl(target));
    imagePaths.push(target);
  });
  return {
    ...sanitized,
    imagePaths,
    images,
    imageFavorites: imagePaths.map((filePath) => favoriteState(filePath)),
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
      turns
        .filter((turn) => String(turn?.id || '') === targetId)
        .forEach(removeConversationReferences);
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

function removeStoredConversationImagePaths(filePaths) {
  const targets = new Set(
    (Array.isArray(filePaths) ? filePaths : [filePaths])
      .filter(Boolean)
      .map(comparableFilePath),
  );
  if (!targets.size) return;
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
          const keep = !targets.has(comparableFilePath(itemPath));
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

function deleteGalleryFiles(filePaths) {
  const failed = [];
  const uniqueTargets = new Map();
  for (const filePath of Array.isArray(filePaths) ? filePaths : []) {
    const target = path.resolve(String(filePath || ''));
    if (!isGalleryImage(target)) {
      failed.push({
        path: String(filePath || ''),
        error: '作品图片路径无效',
      });
      continue;
    }
    uniqueTargets.set(comparableFilePath(target), target);
  }

  const deletedPaths = [];
  const trashRecords = [];
  const missingPaths = [];
  for (const target of uniqueTargets.values()) {
    if (!fs.existsSync(target)) {
      missingPaths.push(target);
      continue;
    }
    try {
      const record = moveImageToTrash(target);
      moveFavorite(target, record.trashPath);
      moveImageMetadata(target, record.trashPath);
      updateStoredConversationImagePath(target, record.trashPath);
      trashRecords.push(record);
      deletedPaths.push(target);
    } catch (error) {
      failed.push({
        path: target,
        error: formatUserError(error, '删除图片失败'),
      });
    }
  }

  const removedPaths = [...deletedPaths, ...missingPaths];
  removeFavorites(missingPaths);
  removeImageMetadata(missingPaths);
  let historySyncError = '';
  try {
    removeStoredConversationImagePaths(missingPaths);
  } catch (error) {
    historySyncError = formatUserError(
      error,
      '图片已删除，但创作记录同步失败，请稍后检查',
    );
  }

  return {
    canceled: false,
    deleted: deletedPaths.length,
    deletedPaths,
    missingPaths,
    removedPaths,
    trashRecords,
    failed,
    historySyncError,
  };
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
  const roots = Array.from(new Set(galleryRoots()));
  pruneMissingFavorites(roots);
  pruneMissingImageMetadata(roots);
  for (const root of roots) {
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

function clearGalleryData() {
  const roots = Array.from(new Set(galleryRoots()));
  const result = {
    deletedImages: 0,
    deletedConversationFiles: 0,
    deletedReferenceDirectories: 0,
    failed: [],
  };

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    let dateDirectories;
    try {
      dateDirectories = fs.readdirSync(root, { withFileTypes: true });
    } catch (error) {
      result.failed.push({ path: root, error: formatUserError(error) });
      continue;
    }

    for (const entry of dateDirectories) {
      if (!entry.isDirectory() || !GALLERY_DATE_PATTERN.test(entry.name)) {
        continue;
      }
      const directory = path.join(root, entry.name);
      try {
        for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
          const target = path.join(directory, item.name);
          if (item.isFile() && IMAGE_PATTERN.test(item.name)) {
            fs.rmSync(target, { force: true });
            result.deletedImages += 1;
          } else if (item.isFile() && item.name === CONVERSATION_FILE) {
            fs.rmSync(target, { force: true });
            result.deletedConversationFiles += 1;
          } else if (
            item.isDirectory() &&
            item.name === CONVERSATION_REFERENCE_DIRECTORY
          ) {
            fs.rmSync(target, { recursive: true, force: true });
            result.deletedReferenceDirectories += 1;
          }
        }
        if (!fs.readdirSync(directory).length) {
          fs.rmSync(directory, { recursive: true, force: true });
        }
      } catch (error) {
        result.failed.push({ path: directory, error: formatUserError(error) });
      }
    }
  }

  try {
    fs.rmSync(storageSettingsPath(), { force: true });
  } catch (error) {
    result.failed.push({
      path: storageSettingsPath(),
      error: formatUserError(error),
    });
  }

  try {
    clearFavoriteData();
  } catch (error) {
    result.failed.push({
      path: 'gallery-favorites.json',
      error: formatUserError(error),
    });
  }

  try {
    clearImageMetadataData();
  } catch (error) {
    result.failed.push({
      path: 'gallery-image-metadata.json',
      error: formatUserError(error),
    });
  }

  try {
    clearTrashData();
  } catch (error) {
    result.failed.push({
      path: 'GalleryTrash',
      error: formatUserError(error),
    });
  }

  configuredGalleryRoot = undefined;
  knownGalleryRoots = [];
  storageSettingsLoaded = true;
  return { ...result, storage: galleryStorageSettings() };
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

function imageFileHash(filePath) {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

function galleryImageFiles() {
  const files = [];
  for (const root of new Set(galleryRoots())) {
    if (!fs.existsSync(root)) continue;
    for (const directory of fs.readdirSync(root, { withFileTypes: true })) {
      if (!directory.isDirectory()) continue;
      const dateDirectory = path.join(root, directory.name);
      for (const entry of fs.readdirSync(dateDirectory, {
        withFileTypes: true,
      })) {
        if (entry.isFile() && IMAGE_PATTERN.test(entry.name)) {
          files.push(path.join(dateDirectory, entry.name));
        }
      }
    }
  }
  return files;
}

function galleryHashIndex() {
  const index = new Map();
  const uncached = [];
  for (const filePath of galleryImageFiles()) {
    const cached = imageMetadataState(filePath).hash;
    const hash = cached || imageFileHash(filePath);
    if (!cached) uncached.push({ path: filePath, hash });
    if (!index.has(hash)) index.set(hash, filePath);
  }
  setImageHashes(uncached);
  return index;
}

function importGalleryFiles(filePaths) {
  const directory = galleryDir();
  const items = [];
  const failed = [];
  const duplicates = [];
  const hashIndex = galleryHashIndex();
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
      const hash = imageFileHash(sourcePath);
      const duplicatePath = hashIndex.get(hash);
      if (duplicatePath) {
        duplicates.push({
          name: path.basename(sourcePath),
          existingPath: duplicatePath,
        });
        continue;
      }
      const targetPath = availableImportPath(
        directory,
        path.basename(sourcePath),
      );
      fs.copyFileSync(sourcePath, targetPath);
      const importedAt = new Date();
      fs.utimesSync(targetPath, importedAt, importedAt);
      setImageHashes([{ path: targetPath, hash }]);
      hashIndex.set(hash, targetPath);
      items.push(galleryItem(targetPath));
    } catch (error) {
      failed.push({
        name: path.basename(sourcePath) || '未知文件',
        error: formatUserError(error, '导入失败'),
      });
    }
  }
  return { canceled: false, items, failed, duplicates };
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
  const hashes = [];

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
    hashes.push({
      path: filePath,
      hash: crypto.createHash('sha256').update(buffer).digest('hex'),
    });
    localPaths.push(filePath);
    images.push(`data:${mime};base64,${buffer.toString('base64')}`);
  }

  setImageHashes(hashes);

  return { images, localPaths, folder: directory };
}

function registerGalleryHandlers() {
  ipcMain.handle('get-gallery-storage', async () => galleryStorageSettings());

  ipcMain.handle('choose-gallery-storage', async (_event, currentPath) => {
    const result = await dialog.showOpenDialog({
      title: '选择作品与历史记录存储位置',
      defaultPath: String(currentPath || currentGalleryRoot()),
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled || !result.filePaths[0]
      ? { canceled: true, directory: '' }
      : { canceled: false, directory: path.resolve(result.filePaths[0]) };
  });

  ipcMain.handle('set-gallery-storage', async (_event, directory) =>
    saveConfiguredGalleryRoot(directory),
  );

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

  ipcMain.handle('list-gallery-trash', () => listTrash().map(trashGalleryItem));

  ipcMain.handle('restore-gallery-trash-item', (_event, id) => {
    const restored = restoreTrashItem(String(id || ''));
    moveFavorite(restored.trashPath, restored.restoredPath);
    moveImageMetadata(restored.trashPath, restored.restoredPath);
    updateStoredConversationImagePath(
      restored.trashPath,
      restored.restoredPath,
    );
    return { restored: true, item: galleryItem(restored.restoredPath) };
  });

  ipcMain.handle('delete-gallery-trash-items', (_event, ids) => {
    const result = deleteTrashItems(ids);
    const removedPaths = result.removed.map((item) => item.trashPath);
    removeFavorites(removedPaths);
    removeImageMetadata(removedPaths);
    removeStoredConversationImagePaths(removedPaths);
    return {
      deleted: result.removed.length,
      deletedIds: result.removed.map((item) => item.id),
      failed: result.failed,
    };
  });

  ipcMain.handle('empty-gallery-trash', () => {
    const result = emptyTrash();
    const removedPaths = result.removed.map((item) => item.trashPath);
    removeFavorites(removedPaths);
    removeImageMetadata(removedPaths);
    removeStoredConversationImagePaths(removedPaths);
    return { deleted: result.removed.length, failed: result.failed };
  });

  ipcMain.handle('read-gallery-image', async (_event, filePath) =>
    galleryImageData(filePath),
  );

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
        return { canceled: true, items: [], failed: [], duplicates: [] };
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

  ipcMain.handle('copy-image', async (_event, payload) => {
    const filePath = path.resolve(payload?.filePath || '');
    const image =
      isGalleryImage(filePath) && fs.existsSync(filePath)
        ? nativeImage.createFromPath(filePath)
        : nativeImage.createFromDataURL(
            typeof payload === 'string' ? payload : payload?.src,
          );
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
    inheritImageMetadata(sourcePath, targetPath);

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

  ipcMain.handle('delete-gallery-images', async (_event, filePaths) =>
    deleteGalleryFiles(filePaths),
  );

  ipcMain.handle('set-gallery-favorite', async (_event, payload) => {
    const target = path.resolve(payload?.filePath || '');
    if (!isGalleryImage(target) || !fs.existsSync(target)) {
      throw new Error('作品图片不存在或路径无效');
    }
    setFavorite(target, payload?.favorite === true);
    return galleryItem(target);
  });

  ipcMain.handle('get-gallery-favorite', async (_event, filePath) => {
    const target = path.resolve(filePath || '');
    if (!isGalleryImage(target) || !fs.existsSync(target)) {
      return { favorite: false, favoritedAt: null };
    }
    return favoriteState(target);
  });

  ipcMain.handle('get-gallery-image-metadata', async (_event, filePath) => {
    const target = path.resolve(filePath || '');
    if (!isGalleryImage(target) || !fs.existsSync(target)) {
      throw new Error('作品图片不存在或路径无效');
    }
    let metadata = imageMetadataState(target);
    if (!metadata.hasPrompt) {
      const turn = findConversationByImage(target);
      if (turn?.prompt) {
        setConversationImageMetadata(turn);
        metadata = imageMetadataState(target);
      }
    }
    const stat = fs.statSync(target);
    const versions = metadataVersions(target)
      .filter((item) => fs.existsSync(item.path))
      .map((item) => ({
        path: item.path,
        name: path.basename(item.path),
        version: item.version,
        source: item.source,
        createdAt: item.createdAt,
        image: galleryImageUrl(item.path),
      }));
    return {
      ...metadata,
      path: target,
      name: path.basename(target),
      fileSize: stat.size,
      modifiedAt: stat.mtimeMs,
      ...imageDimensions(target, stat.size),
      versions,
    };
  });

  ipcMain.handle('update-gallery-image-metadata', async (_event, payload) => {
    const target = path.resolve(payload?.filePath || '');
    if (!isGalleryImage(target) || !fs.existsSync(target)) {
      throw new Error('作品图片不存在或路径无效');
    }
    const metadata = updateImageMetadata(target, payload?.metadata || {});
    return { ...galleryItem(target), metadata };
  });

  ipcMain.handle('get-gallery-metadata-facets', () => imageMetadataFacets());

  ipcMain.handle('search-gallery-metadata', (_event, query) =>
    matchingMetadataPaths(query),
  );

  ipcMain.handle('restore-gallery-image-version', async (_event, filePath) => {
    const source = path.resolve(filePath || '');
    if (!isGalleryImage(source) || !fs.existsSync(source)) {
      throw new Error('要恢复的图片版本不存在');
    }
    const extension = path.extname(source).toLowerCase();
    const stem = path.basename(source, extension);
    const directory = galleryDir();
    const target = availableImportPath(
      directory,
      `${stem}-restored-${Date.now()}${extension}`,
    );
    fs.copyFileSync(source, target);
    const restoredAt = new Date();
    fs.utimesSync(target, restoredAt, restoredAt);
    inheritImageMetadata(source, target);
    return { restored: true, item: galleryItem(target) };
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
      moveFavorite(sourcePath, targetPath);
      moveImageMetadata(sourcePath, targetPath);
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

module.exports = {
  clearGalleryData,
  collectConversationTurns,
  currentGalleryRoot,
  deleteGalleryFiles,
  listGallery,
  registerGalleryHandlers,
  registerGalleryProtocol,
  registerGalleryScheme,
  saveGeneratedImages,
  saveConversationTurn,
};
