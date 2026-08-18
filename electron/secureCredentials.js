const fs = require('fs');
const path = require('path');
const { app, ipcMain, safeStorage } = require('electron');

const CREDENTIALS_FILE = 'secure-credentials.json';

function credentialsPath() {
  return path.join(app.getPath('userData'), CREDENTIALS_FILE);
}

function readCredentials() {
  try {
    const value = JSON.parse(fs.readFileSync(credentialsPath(), 'utf8')) || {};
    if (value.apiKeys && typeof value.apiKeys === 'object') return value;
    return value.apiKey
      ? { version: 2, apiKeys: { default: value.apiKey } }
      : value;
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

function getApiKey(profileId = 'default') {
  const credentials = readCredentials();
  const encrypted = String(
    credentials.apiKeys?.[String(profileId || 'default')] ||
      (profileId === 'openai-main' ? credentials.apiKeys?.default : '') ||
      '',
  );
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

function setApiKey(profileId, value) {
  if (value === undefined) {
    value = profileId;
    profileId = 'default';
  }
  profileId = String(profileId || 'default');
  const apiKey = String(value || '').trim();
  if (!apiKey) {
    clearSecureCredentials(profileId);
    return true;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统安全存储暂不可用，无法保存 API Key');
  }
  const credentials = readCredentials();
  writeCredentials({
    version: 2,
    apiKeys: {
      ...(credentials.apiKeys || {}),
      [profileId]: safeStorage.encryptString(apiKey).toString('base64'),
    },
    updatedAt: new Date().toISOString(),
  });
  return true;
}

function clearSecureCredentials(profileId = '') {
  if (!profileId) {
    fs.rmSync(credentialsPath(), { force: true });
    fs.rmSync(`${credentialsPath()}.tmp`, { force: true });
    return;
  }
  const credentials = readCredentials();
  delete credentials.apiKeys?.[String(profileId)];
  if (!Object.keys(credentials.apiKeys || {}).length) {
    fs.rmSync(credentialsPath(), { force: true });
    fs.rmSync(`${credentialsPath()}.tmp`, { force: true });
    return;
  }
  writeCredentials({
    ...credentials,
    version: 2,
    updatedAt: new Date().toISOString(),
  });
}

function registerSecureCredentialHandlers() {
  ipcMain.handle('get-secure-api-key', (_event, profileId) =>
    getApiKey(profileId),
  );
  ipcMain.handle('set-secure-api-key', (_event, profileId, value) =>
    setApiKey(profileId, value),
  );
  ipcMain.handle('clear-secure-api-key', (_event, profileId) => {
    clearSecureCredentials(profileId);
    return true;
  });
}

module.exports = {
  clearSecureCredentials,
  registerSecureCredentialHandlers,
};
