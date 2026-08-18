const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const FAVORITES_FILE = 'gallery-favorites.json';
const FAVORITES_VERSION = 1;
let favoritesLoaded = false;
let favorites = new Map();

function comparablePath(filePath) {
  const target = path.resolve(String(filePath || ''));
  return process.platform === 'win32' ? target.toLowerCase() : target;
}

function favoritesPath() {
  return path.join(app.getPath('userData'), FAVORITES_FILE);
}

function loadFavorites() {
  if (favoritesLoaded) return;
  favoritesLoaded = true;
  favorites = new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(favoritesPath(), 'utf8'));
    if (Number(parsed?.version) !== FAVORITES_VERSION || !parsed?.items) {
      return;
    }
    for (const value of Object.values(parsed.items)) {
      const rawPath = String(value?.path || '').trim();
      if (!rawPath) continue;
      const filePath = path.resolve(rawPath);
      favorites.set(comparablePath(filePath), {
        path: filePath,
        favoritedAt: Math.max(1, Number(value?.favoritedAt) || Date.now()),
      });
    }
  } catch {
    // A missing or invalid metadata file is equivalent to no favorites.
  }
}

function saveFavorites() {
  const target = favoritesPath();
  const temporaryTarget = `${target}.tmp`;
  const items = {};
  for (const [key, value] of [...favorites.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    items[key] = value;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    temporaryTarget,
    `${JSON.stringify({ version: FAVORITES_VERSION, items }, null, 2)}\n`,
    'utf8',
  );
  fs.renameSync(temporaryTarget, target);
}

function favoriteState(filePath) {
  loadFavorites();
  const record = favorites.get(comparablePath(filePath));
  return {
    favorite: Boolean(record),
    favoritedAt: record?.favoritedAt || null,
  };
}

function setFavorite(filePath, favorite) {
  loadFavorites();
  const target = path.resolve(String(filePath || ''));
  const key = comparablePath(target);
  const current = favorites.get(key);
  if (favorite) {
    favorites.set(key, {
      path: target,
      favoritedAt: current?.favoritedAt || Date.now(),
    });
  } else {
    favorites.delete(key);
  }
  saveFavorites();
  return favoriteState(target);
}

function moveFavorite(oldPath, nextPath) {
  loadFavorites();
  const oldKey = comparablePath(oldPath);
  const record = favorites.get(oldKey);
  if (!record) return;
  const target = path.resolve(String(nextPath || ''));
  favorites.delete(oldKey);
  favorites.set(comparablePath(target), { ...record, path: target });
  saveFavorites();
}

function removeFavorites(filePaths) {
  loadFavorites();
  let changed = false;
  for (const filePath of filePaths) {
    changed = favorites.delete(comparablePath(filePath)) || changed;
  }
  if (changed) saveFavorites();
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return Boolean(
    relative && !relative.startsWith(`..${path.sep}`) && relative !== '..',
  );
}

function pruneMissingFavorites(roots) {
  loadFavorites();
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
  for (const [key, record] of favorites) {
    if (
      availableRoots.some((root) => isInside(root, record.path)) &&
      !fs.existsSync(record.path)
    ) {
      favorites.delete(key);
      changed = true;
    }
  }
  if (changed) saveFavorites();
}

function clearFavoriteData() {
  favoritesLoaded = true;
  favorites = new Map();
  fs.rmSync(favoritesPath(), { force: true });
  fs.rmSync(`${favoritesPath()}.tmp`, { force: true });
}

module.exports = {
  clearFavoriteData,
  favoriteState,
  moveFavorite,
  pruneMissingFavorites,
  removeFavorites,
  setFavorite,
};
