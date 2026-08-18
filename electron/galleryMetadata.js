const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const METADATA_FILE = 'gallery-image-metadata.json';
const METADATA_VERSION = 1;
let metadataLoaded = false;
let imageMetadata = new Map();

function comparablePath(filePath) {
  const target = path.resolve(String(filePath || ''));
  return process.platform === 'win32' ? target.toLowerCase() : target;
}

function metadataPath() {
  return path.join(app.getPath('userData'), METADATA_FILE);
}

function optionalPath(value) {
  const raw = String(value || '').trim();
  return raw ? path.resolve(raw) : '';
}

function normalizedTags(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || '')
        .split(/[,，]/)
        .map((item) => item.trim());
  return Array.from(
    new Set(values.map((item) => String(item || '').trim()).filter(Boolean)),
  )
    .slice(0, 24)
    .map((item) => item.slice(0, 40));
}

function normalizedMetadata(value = {}, filePath = '') {
  const prompt = String(value.prompt || '').trim();
  return {
    path: path.resolve(filePath || value.path),
    prompt,
    model: String(value.model || ''),
    ratio: String(value.ratio || ''),
    resolution: String(value.resolution || ''),
    quality: String(value.quality || ''),
    outputFormat: String(value.outputFormat || ''),
    conversationId: String(value.conversationId || value.id || ''),
    source: ['generated', 'edited', 'manual'].includes(value.source)
      ? value.source
      : 'generated',
    createdAt: Math.max(0, Number(value.createdAt) || 0),
    updatedAt: Math.max(1, Number(value.updatedAt) || Date.now()),
    title: String(value.title || '')
      .trim()
      .slice(0, 160),
    note: String(value.note || '')
      .trim()
      .slice(0, 8000),
    tags: normalizedTags(value.tags),
    album: String(value.album || '')
      .trim()
      .slice(0, 80),
    colorLabel: ['red', 'gold', 'green', 'blue', 'purple'].includes(
      value.colorLabel,
    )
      ? value.colorLabel
      : '',
    hash: /^[a-f0-9]{64}$/i.test(String(value.hash || ''))
      ? String(value.hash).toLowerCase()
      : '',
    parentPath: optionalPath(value.parentPath),
    rootPath: optionalPath(value.rootPath),
    version: Math.max(1, Number(value.version) || 1),
    hasPrompt: Boolean(prompt),
  };
}

function loadMetadata() {
  if (metadataLoaded) return;
  metadataLoaded = true;
  imageMetadata = new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(metadataPath(), 'utf8'));
    if (Number(parsed?.version) !== METADATA_VERSION || !parsed?.items) return;
    for (const value of Object.values(parsed.items)) {
      const rawPath = String(value?.path || '').trim();
      if (!rawPath) continue;
      const record = normalizedMetadata(value, rawPath);
      imageMetadata.set(comparablePath(record.path), record);
    }
  } catch {
    // Missing or invalid metadata is treated as an empty local index.
  }
}

function saveMetadata() {
  const target = metadataPath();
  const temporaryTarget = `${target}.tmp`;
  const items = {};
  for (const [key, value] of [...imageMetadata.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    items[key] = value;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    temporaryTarget,
    `${JSON.stringify({ version: METADATA_VERSION, items }, null, 2)}\n`,
    'utf8',
  );
  fs.renameSync(temporaryTarget, target);
}

function imageMetadataState(filePath) {
  loadMetadata();
  const rawPath = String(filePath || '').trim();
  const record = rawPath ? imageMetadata.get(comparablePath(rawPath)) : null;
  return record
    ? { ...record }
    : {
        path: rawPath ? path.resolve(rawPath) : '',
        prompt: '',
        model: '',
        ratio: '',
        resolution: '',
        quality: '',
        outputFormat: '',
        conversationId: '',
        source: '',
        createdAt: 0,
        updatedAt: 0,
        title: '',
        note: '',
        tags: [],
        album: '',
        colorLabel: '',
        hash: '',
        parentPath: '',
        rootPath: '',
        version: 1,
        hasPrompt: false,
      };
}

function setImageMetadata(filePath, value) {
  loadMetadata();
  const rawPath = String(filePath || '').trim();
  if (!rawPath) return imageMetadataState('');
  const target = path.resolve(rawPath);
  const record = normalizedMetadata(value, target);
  if (!record.hasPrompt) return imageMetadataState(target);
  imageMetadata.set(comparablePath(target), record);
  saveMetadata();
  return { ...record };
}

function updateImageMetadata(filePath, value = {}) {
  loadMetadata();
  const rawPath = String(filePath || '').trim();
  if (!rawPath) return imageMetadataState('');
  const target = path.resolve(rawPath);
  const current = imageMetadataState(target);
  const record = normalizedMetadata(
    {
      ...current,
      ...value,
      path: target,
      updatedAt: Date.now(),
    },
    target,
  );
  const hasCustomMetadata = Boolean(
    record.hasPrompt ||
    record.title ||
    record.note ||
    record.tags.length ||
    record.album ||
    record.colorLabel ||
    record.hash ||
    record.parentPath ||
    record.rootPath,
  );
  const key = comparablePath(target);
  if (hasCustomMetadata) imageMetadata.set(key, record);
  else imageMetadata.delete(key);
  saveMetadata();
  return hasCustomMetadata ? { ...record } : imageMetadataState(target);
}

function setImageHashes(entries = []) {
  loadMetadata();
  let changed = false;
  for (const entry of entries) {
    const rawPath = String(entry?.path || '').trim();
    const hash = String(entry?.hash || '').toLowerCase();
    if (!rawPath || !/^[a-f0-9]{64}$/.test(hash)) continue;
    const target = path.resolve(rawPath);
    const current = imageMetadataState(target);
    if (current.hash === hash) continue;
    imageMetadata.set(
      comparablePath(target),
      normalizedMetadata({ ...current, hash, updatedAt: Date.now() }, target),
    );
    changed = true;
  }
  if (changed) saveMetadata();
}

function setConversationImageMetadata(turn = {}) {
  loadMetadata();
  const prompt = String(turn.prompt || '').trim();
  const imagePaths = Array.isArray(turn.imagePaths) ? turn.imagePaths : [];
  if (!prompt || !imagePaths.length) return;
  let changed = false;
  for (const filePath of imagePaths) {
    const rawPath = String(filePath || '').trim();
    if (!rawPath) continue;
    const target = path.resolve(rawPath);
    const current = imageMetadata.get(comparablePath(target));
    imageMetadata.set(
      comparablePath(target),
      normalizedMetadata(
        {
          ...current,
          prompt,
          model: turn.model,
          ratio: turn.ratio,
          resolution: turn.resolution,
          quality: turn.quality,
          outputFormat: turn.outputFormat,
          conversationId: turn.id,
          source: 'generated',
          createdAt: turn.createdAt,
          updatedAt: Date.now(),
        },
        target,
      ),
    );
    changed = true;
  }
  if (changed) saveMetadata();
}

function moveImageMetadata(oldPath, nextPath) {
  loadMetadata();
  const oldKey = comparablePath(oldPath);
  const record = imageMetadata.get(oldKey);
  if (!record) return;
  const target = path.resolve(String(nextPath || ''));
  imageMetadata.delete(oldKey);
  imageMetadata.set(comparablePath(target), {
    ...record,
    path: target,
    updatedAt: Date.now(),
  });
  for (const [key, item] of imageMetadata) {
    let changed = false;
    const nextItem = { ...item };
    if (item.parentPath && comparablePath(item.parentPath) === oldKey) {
      nextItem.parentPath = target;
      changed = true;
    }
    if (item.rootPath && comparablePath(item.rootPath) === oldKey) {
      nextItem.rootPath = target;
      changed = true;
    }
    if (changed) imageMetadata.set(key, nextItem);
  }
  saveMetadata();
}

function inheritImageMetadata(sourcePath, targetPath) {
  loadMetadata();
  const record = imageMetadata.get(comparablePath(sourcePath));
  if (!record) return imageMetadataState(targetPath);
  const nextVersion =
    metadataVersions(sourcePath).reduce(
      (maximum, item) => Math.max(maximum, Number(item.version) || 1),
      1,
    ) + 1;
  return setImageMetadata(targetPath, {
    ...record,
    source: 'edited',
    parentPath: path.resolve(sourcePath),
    rootPath: record.rootPath || record.path,
    version: nextVersion,
    updatedAt: Date.now(),
  });
}

function imageMetadataFacets() {
  loadMetadata();
  const albums = new Set();
  const tags = new Set();
  for (const record of imageMetadata.values()) {
    if (record.album) albums.add(record.album);
    record.tags.forEach((tag) => tags.add(tag));
  }
  return {
    albums: [...albums].sort((left, right) => left.localeCompare(right)),
    tags: [...tags].sort((left, right) => left.localeCompare(right)),
  };
}

function matchingMetadataPaths(query) {
  loadMetadata();
  const normalizedQuery = String(query || '')
    .trim()
    .toLowerCase();
  if (!normalizedQuery) return [];
  const matches = [];
  for (const record of imageMetadata.values()) {
    const haystack = [
      record.prompt,
      record.title,
      record.note,
      record.album,
      ...record.tags,
    ]
      .join(' ')
      .toLowerCase();
    if (haystack.includes(normalizedQuery)) matches.push(record.path);
  }
  return matches;
}

function metadataVersions(filePath) {
  loadMetadata();
  const target = imageMetadataState(filePath);
  const rootPath = target.rootPath || target.path;
  const rootKey = rootPath ? comparablePath(rootPath) : '';
  if (!rootKey) return [];
  return [...imageMetadata.values()]
    .filter(
      (record) => comparablePath(record.rootPath || record.path) === rootKey,
    )
    .sort((left, right) => left.version - right.version)
    .map((record) => ({ ...record }));
}

function removeImageMetadata(filePaths) {
  loadMetadata();
  let changed = false;
  for (const filePath of filePaths) {
    changed = imageMetadata.delete(comparablePath(filePath)) || changed;
  }
  if (changed) saveMetadata();
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return Boolean(
    relative && !relative.startsWith(`..${path.sep}`) && relative !== '..',
  );
}

function pruneMissingImageMetadata(roots) {
  loadMetadata();
  const availableRoots = roots
    .map((root) => path.resolve(root))
    .filter((root) => {
      try {
        return fs.statSync(root).isDirectory();
      } catch {
        return false;
      }
    });
  let changed = false;
  for (const [key, record] of imageMetadata) {
    if (
      availableRoots.some((root) => isInside(root, record.path)) &&
      !fs.existsSync(record.path)
    ) {
      imageMetadata.delete(key);
      changed = true;
    }
  }
  if (changed) saveMetadata();
}

function clearImageMetadataData() {
  metadataLoaded = true;
  imageMetadata = new Map();
  fs.rmSync(metadataPath(), { force: true });
  fs.rmSync(`${metadataPath()}.tmp`, { force: true });
}

module.exports = {
  clearImageMetadataData,
  imageMetadataState,
  imageMetadataFacets,
  inheritImageMetadata,
  matchingMetadataPaths,
  metadataVersions,
  moveImageMetadata,
  pruneMissingImageMetadata,
  removeImageMetadata,
  setConversationImageMetadata,
  setImageMetadata,
  setImageHashes,
  updateImageMetadata,
};
