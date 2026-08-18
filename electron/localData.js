const { ipcMain, session } = require('electron');
const { clearGalleryData } = require('./gallery');
const { clearPreferenceData } = require('./preferences');
const { clearSecureCredentials } = require('./secureCredentials');
const { clearGenerationQueueData } = require('./generationQueue');
const { clearShortcutData } = require('./shortcuts');

async function clearLocalData() {
  const result = clearGalleryData();
  try {
    clearPreferenceData();
  } catch (error) {
    result.failed.push({
      path: 'onboarding-state.json',
      error: String(error?.message || error || '首次使用状态清理失败'),
    });
  }
  try {
    clearSecureCredentials();
  } catch (error) {
    result.failed.push({
      path: 'secure-credentials.json',
      error: String(error?.message || error || '安全凭据清理失败'),
    });
  }
  try {
    clearGenerationQueueData();
  } catch (error) {
    result.failed.push({
      path: 'generation-queue.json',
      error: String(error?.message || error || '生成队列清理失败'),
    });
  }
  try {
    clearShortcutData();
  } catch (error) {
    result.failed.push({
      path: 'shortcuts.json',
      error: String(error?.message || error || '快捷键配置清理失败'),
    });
  }
  try {
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();
  } catch (error) {
    result.failed.push({
      path: 'browser-storage',
      error: String(error?.message || error || '浏览器存储清理失败'),
    });
  }
  return result;
}

function registerLocalDataHandlers() {
  ipcMain.handle('clear-local-data', () => clearLocalData());
}

module.exports = { clearLocalData, registerLocalDataHandlers };
