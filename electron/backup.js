const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dialog, ipcMain } = require('electron');
const { favoriteState, setFavorite } = require('./galleryFavorites');
const {
  imageMetadataState,
  updateImageMetadata,
} = require('./galleryMetadata');

const BACKUP_VERSION = 1;
const MANIFEST_NAME = 'loomora-backup.json';

function safeSegment(value, fallback) {
  const normalized = String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim();
  return normalized || fallback;
}

function uniquePath(directory, fileName) {
  const parsed = path.parse(fileName);
  let target = path.join(directory, fileName);
  for (let index = 1; fs.existsSync(target); index += 1) {
    target = path.join(directory, `${parsed.name}-${index}${parsed.ext}`);
  }
  return target;
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function mimeFromPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  return 'image/png';
}

function backupConversations(packageDirectory, conversations) {
  const backedUp = [];
  for (const turn of conversations) {
    const references = [];
    for (
      let index = 0;
      index < (turn.referencePaths || []).length;
      index += 1
    ) {
      const source = path.resolve(turn.referencePaths[index]);
      if (!fs.existsSync(source)) continue;
      const relativeDirectory = path.join(
        'references',
        safeSegment(turn.id, `turn-${turn.createdAt}`),
      );
      const targetDirectory = path.join(packageDirectory, relativeDirectory);
      fs.mkdirSync(targetDirectory, { recursive: true });
      const target = uniquePath(
        targetDirectory,
        safeSegment(path.basename(source), `reference-${index + 1}.png`),
      );
      fs.copyFileSync(source, target);
      references.push({
        file: path.relative(packageDirectory, target).replace(/\\/g, '/'),
        name: turn.referenceNames?.[index] || path.basename(source),
        mime: mimeFromPath(source),
      });
    }
    backedUp.push({
      turn: {
        ...turn,
        referencePaths: [],
        referenceNames: [],
        folder: '',
      },
      references,
    });
  }
  return backedUp;
}

function createBackupPackage(destination, items, conversations) {
  const packageDirectory = uniquePath(
    destination,
    `Loomora-Backup-${timestamp()}`,
  );
  fs.mkdirSync(packageDirectory, { recursive: true });
  const assets = [];
  const failed = [];

  for (const item of items) {
    try {
      const source = path.resolve(item.path);
      if (!fs.existsSync(source)) continue;
      const date = safeSegment(item.date, '未分类');
      const relativeDirectory = path.join('images', date);
      const targetDirectory = path.join(packageDirectory, relativeDirectory);
      fs.mkdirSync(targetDirectory, { recursive: true });
      const target = uniquePath(
        targetDirectory,
        safeSegment(item.name || path.basename(source), 'image.png'),
      );
      fs.copyFileSync(source, target);
      const metadata = imageMetadataState(source);
      const favorite = favoriteState(source);
      assets.push({
        file: path.relative(packageDirectory, target).replace(/\\/g, '/'),
        originalPath: source,
        date,
        name: path.basename(target),
        hash: metadata.hash || sha256(source),
        metadata: { ...metadata, path: undefined },
        favorite,
      });
    } catch (error) {
      failed.push({
        path: item.path,
        error: String(error?.message || error),
      });
    }
  }

  const conversationRecords = backupConversations(
    packageDirectory,
    conversations,
  );
  const manifest = {
    format: 'loomora-backup',
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    includesCredentials: false,
    assetCount: assets.length,
    assets,
    conversationCount: conversationRecords.length,
    conversations: conversationRecords,
  };
  fs.writeFileSync(
    path.join(packageDirectory, MANIFEST_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  return { directory: packageDirectory, count: assets.length, failed };
}

function readManifest(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (
    manifest?.format !== 'loomora-backup' ||
    Number(manifest?.version) !== BACKUP_VERSION ||
    !Array.isArray(manifest?.assets)
  ) {
    throw new Error('这不是有效的 Loomora 备份包');
  }
  return manifest;
}

function restoreBackupPackage(manifestPath, galleryRoot, saveConversationTurn) {
  const manifest = readManifest(manifestPath);
  const packageDirectory = path.dirname(manifestPath);
  const pathMap = new Map();
  const restored = [];
  const failed = [];

  for (const asset of manifest.assets) {
    try {
      const source = path.resolve(packageDirectory, String(asset.file || ''));
      const relative = path.relative(packageDirectory, source);
      if (
        !relative ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        !fs.existsSync(source)
      ) {
        throw new Error('备份图片不存在或路径无效');
      }
      const targetDirectory = path.join(
        galleryRoot,
        safeSegment(asset.date, new Date().toLocaleDateString('en-CA')),
      );
      fs.mkdirSync(targetDirectory, { recursive: true });
      const target = uniquePath(
        targetDirectory,
        safeSegment(asset.name || path.basename(source), 'image.png'),
      );
      fs.copyFileSync(source, target);
      pathMap.set(path.resolve(String(asset.originalPath || '')), target);
      restored.push({ asset, target });
    } catch (error) {
      failed.push({
        file: String(asset?.file || ''),
        error: String(error?.message || error),
      });
    }
  }

  for (const { asset, target } of restored) {
    const metadata = { ...(asset.metadata || {}) };
    metadata.hash = String(asset.hash || metadata.hash || '');
    if (metadata.parentPath) {
      metadata.parentPath =
        pathMap.get(path.resolve(metadata.parentPath)) || '';
    }
    if (metadata.rootPath) {
      metadata.rootPath =
        pathMap.get(path.resolve(metadata.rootPath)) || target;
    }
    updateImageMetadata(target, metadata);
    if (asset.favorite?.favorite) setFavorite(target, true);
  }

  let restoredConversations = 0;
  for (const record of manifest.conversations || []) {
    try {
      const references = (record.references || []).map((reference) => {
        const source = path.resolve(
          packageDirectory,
          String(reference.file || ''),
        );
        const relative = path.relative(packageDirectory, source);
        if (
          !relative ||
          relative === '..' ||
          relative.startsWith(`..${path.sep}`) ||
          !fs.existsSync(source)
        ) {
          throw new Error('备份参考图不存在或路径无效');
        }
        return {
          name: String(reference.name || path.basename(source)),
          data: `data:${reference.mime || mimeFromPath(source)};base64,${fs.readFileSync(source).toString('base64')}`,
        };
      });
      const turn = record.turn || {};
      const imagePaths = (turn.imagePaths || [])
        .map((filePath) => pathMap.get(path.resolve(filePath)))
        .filter(Boolean);
      saveConversationTurn({
        ...turn,
        folder: '',
        imagePaths,
        references,
        referencePaths: [],
        referenceNames: [],
      });
      restoredConversations += 1;
    } catch (error) {
      failed.push({
        conversationId: String(record?.turn?.id || ''),
        error: String(error?.message || error),
      });
    }
  }

  return {
    restored: restored.length,
    restoredConversations,
    failed,
    createdAt: manifest.createdAt,
  };
}

function registerBackupHandlers({
  collectConversationTurns,
  currentGalleryRoot,
  listGallery,
  saveConversationTurn,
}) {
  ipcMain.handle('create-local-backup', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择 Loomora 备份保存位置',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return {
      canceled: false,
      ...createBackupPackage(
        result.filePaths[0],
        listGallery(),
        collectConversationTurns(),
      ),
    };
  });

  ipcMain.handle('restore-local-backup', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择 Loomora 备份清单',
      properties: ['openFile'],
      filters: [{ name: 'Loomora 备份', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return {
      canceled: false,
      ...restoreBackupPackage(
        result.filePaths[0],
        currentGalleryRoot(),
        saveConversationTurn,
      ),
    };
  });
}

module.exports = { registerBackupHandlers };
