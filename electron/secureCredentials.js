const fs = require('fs');
const path = require('path');
const { app, ipcMain, safeStorage } = require('electron');

const CREDENTIALS_FILE = 'secure-credentials.json';

function credentialsPath() {
  return path.join(app.getPath('userData'), CREDENTIALS_FILE);
}

function readCredentials() {
  try {
    return JSON.parse(fs.readFileSync(credentialsPath(), 'utf8')) || {};
  } catch {
    return {};
  }
}

function writeCredentials(value) {
  const target = credentialsPath();
  const temporary = `${target}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, target);
}

function getApiKey() {
  const encrypted = String(readCredentials().apiKey || '');
  if (!encrypted) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统安全存储暂不可用，无法读取 API Key');
  }
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  } catch {
    throw new Error('API Key 无法解密，请在设置中重新填写');
  }
}

function setApiKey(value) {
  const apiKey = String(value || '').trim();
  if (!apiKey) {
    clearSecureCredentials();
    return true;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统安全存储暂不可用，无法保存 API Key');
  }
  writeCredentials({
    version: 1,
    apiKey: safeStorage.encryptString(apiKey).toString('base64'),
    updatedAt: new Date().toISOString(),
  });
  return true;
}

function clearSecureCredentials() {
  fs.rmSync(credentialsPath(), { force: true });
  fs.rmSync(`${credentialsPath()}.tmp`, { force: true });
}

function registerSecureCredentialHandlers() {
  ipcMain.handle('get-secure-api-key', () => getApiKey());
  ipcMain.handle('set-secure-api-key', (_event, value) => setApiKey(value));
  ipcMain.handle('clear-secure-api-key', () => {
    clearSecureCredentials();
    return true;
  });
}

module.exports = {
  clearSecureCredentials,
  registerSecureCredentialHandlers,
};
