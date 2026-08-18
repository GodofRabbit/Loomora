const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const TRASH_FILE = 'gallery-trash.json';
const TRASH_VERSION = 1;
const TRASH_DIRECTORY = 'GalleryTrash';

function trashManifestPath() {
  return path.join(app.getPath('userData'), TRASH_FILE);
}

function trashDirectory() {
  return path.join(app.getPath('userData'), TRASH_DIRECTORY);
}

function readTrash() {
  try {
    const parsed = JSON.parse(fs.readFileSync(trashManifestPath(), 'utf8'));
    if (
      Number(parsed?.version) !== TRASH_VERSION ||
      !Array.isArray(parsed.items)
    ) {
      return [];
    }
    return parsed.items.filter(
      (item) =>
        item?.id &&
        String(item.originalPath || '').trim() &&
        String(item.trashPath || '').trim(),
    );
  } catch {
    return [];
  }
}

function writeTrash(items) {
  const target = trashManifestPath();
  const temporaryTarget = `${target}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    temporaryTarget,
    `${JSON.stringify({ version: TRASH_VERSION, items }, null, 2)}\n`,
    'utf8',
  );
  fs.renameSync(temporaryTarget, target);
}

function uniquePath(directory, fileName) {
  const parsed = path.parse(path.basename(fileName));
  let candidate = path.join(directory, `${parsed.name}${parsed.ext}`);
  for (let suffix = 1; fs.existsSync(candidate); suffix += 1) {
    candidate = path.join(directory, `${parsed.name}-${suffix}${parsed.ext}`);
  }
  return candidate;
}

function moveFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    fs.renameSync(source, target);
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;
    fs.copyFileSync(source, target);
    fs.rmSync(source);
  }
}

function moveImageToTrash(filePath) {
  const source = path.resolve(filePath);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const target = uniquePath(trashDirectory(), `${id}-${path.basename(source)}`);
  moveFile(source, target);
  const record = {
    id,
    originalPath: source,
    trashPath: target,
    name: path.basename(source),
    deletedAt: Date.now(),
  };
  writeTrash([record, ...readTrash()]);
  return record;
}

function listTrash() {
  const items = readTrash();
  const existing = items.filter((item) => fs.existsSync(item.trashPath));
  if (existing.length !== items.length) writeTrash(existing);
  return existing.sort((left, right) => right.deletedAt - left.deletedAt);
}

function restoreTrashItem(id) {
  const items = readTrash();
  const record = items.find((item) => item.id === id);
  if (!record || !fs.existsSync(record.trashPath)) {
    throw new Error('回收站中的图片不存在');
  }
  const target = uniquePath(
    path.dirname(record.originalPath),
    path.basename(record.originalPath),
  );
  moveFile(record.trashPath, target);
  writeTrash(items.filter((item) => item.id !== id));
  return { ...record, restoredPath: target };
}

function deleteTrashItems(ids) {
  const idSet = new Set(Array.isArray(ids) ? ids : [ids]);
  const items = readTrash();
  const removed = [];
  const failed = [];
  const kept = [];
  for (const item of items) {
    if (!idSet.has(item.id)) {
      kept.push(item);
      continue;
    }
    try {
      fs.rmSync(item.trashPath, { force: true });
      removed.push(item);
    } catch (error) {
      kept.push(item);
      failed.push({ id: item.id, error: String(error?.message || error) });
    }
  }
  writeTrash(kept);
  return { removed, failed };
}

function emptyTrash() {
  return deleteTrashItems(readTrash().map((item) => item.id));
}

function isTrashImage(filePath) {
  const relative = path.relative(
    trashDirectory(),
    path.resolve(filePath || ''),
  );
  return Boolean(
    relative && !relative.startsWith(`..${path.sep}`) && relative !== '..',
  );
}

function clearTrashData() {
  fs.rmSync(trashDirectory(), { recursive: true, force: true });
  fs.rmSync(trashManifestPath(), { force: true });
  fs.rmSync(`${trashManifestPath()}.tmp`, { force: true });
}

module.exports = {
  clearTrashData,
  deleteTrashItems,
  emptyTrash,
  isTrashImage,
  listTrash,
  moveImageToTrash,
  restoreTrashItem,
};
