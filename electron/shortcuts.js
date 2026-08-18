const fs = require('fs');
const path = require('path');
const { app, ipcMain } = require('electron');

const SHORTCUTS_FILE = 'shortcuts.json';
const DEFAULT_SHORTCUTS = {
  create: { code: 'Digit1', mod: true },
  gallery: { code: 'Digit2', mod: true },
  favorite: { code: 'KeyD', mod: true },
  viewPrompt: { code: 'KeyP', mod: true },
  copyPrompt: { code: 'KeyC', mod: true, shift: true },
  deleteImage: { code: 'Delete' },
  previousImage: { code: 'ArrowLeft' },
  nextImage: { code: 'ArrowRight' },
};

function shortcutsPath() {
  return path.join(app.getPath('userData'), SHORTCUTS_FILE);
}

function normalizeBinding(value, fallback) {
  const code = String(value?.code || '');
  if (
    !/^(Key[A-Z]|Digit[0-9]|Arrow(Left|Right|Up|Down)|Delete|Backspace|F([1-9]|1[0-2]))$/.test(
      code,
    )
  ) {
    return { ...fallback };
  }
  return {
    code,
    ...(value?.mod ? { mod: true } : {}),
    ...(value?.ctrl ? { ctrl: true } : {}),
    ...(value?.meta ? { meta: true } : {}),
    ...(value?.alt ? { alt: true } : {}),
    ...(value?.shift ? { shift: true } : {}),
  };
}

function readShortcuts() {
  let saved = {};
  try {
    saved =
      JSON.parse(fs.readFileSync(shortcutsPath(), 'utf8'))?.shortcuts || {};
  } catch {}
  return Object.fromEntries(
    Object.entries(DEFAULT_SHORTCUTS).map(([key, fallback]) => [
      key,
      normalizeBinding(saved[key], fallback),
    ]),
  );
}

function writeShortcuts(value) {
  const shortcuts = Object.fromEntries(
    Object.entries(DEFAULT_SHORTCUTS).map(([key, fallback]) => [
      key,
      normalizeBinding(value?.[key], fallback),
    ]),
  );
  const target = shortcutsPath();
  const temporary = `${target}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    temporary,
    `${JSON.stringify({ version: 1, shortcuts }, null, 2)}\n`,
    'utf8',
  );
  fs.renameSync(temporary, target);
  return shortcuts;
}

function clearShortcutData() {
  fs.rmSync(shortcutsPath(), { force: true });
  fs.rmSync(`${shortcutsPath()}.tmp`, { force: true });
}

function registerShortcutHandlers() {
  ipcMain.handle('get-shortcuts', () => readShortcuts());
  ipcMain.handle('set-shortcuts', (_event, value) => writeShortcuts(value));
  ipcMain.handle('reset-shortcuts', () => {
    return structuredClone(DEFAULT_SHORTCUTS);
  });
}

module.exports = {
  clearShortcutData,
  registerShortcutHandlers,
};
