const { app, net } = require('electron');
const { autoUpdater } = require('electron-updater');

const UPDATE_FEED_URLS = {
  win32: '',
  darwin: '',
};
const RELEASE_SOURCES = [
  {
    id: 'gitee',
    label: 'Gitee',
    api: 'https://gitee.com/api/v5/repos/cuteRabbit/Loomora/releases/latest',
  },
  {
    id: 'github',
    label: 'GitHub',
    api: 'https://api.github.com/repos/GodofRabbit/Loomora/releases/latest',
  },
];
const PLACEHOLDER_HOSTS = new Set([
  'example.com',
  'example.invalid',
  'updates.example.com',
]);

let getWindow = () => null;
let initialized = false;
let state = {
  status: 'idle',
  message: '尚未检查更新',
  version: '',
  progress: 0,
  info: null,
  source: '',
};

function configuredFeedUrl() {
  const environmentKey =
    process.platform === 'darwin'
      ? 'LOOMORA_MACOS_UPDATE_URL'
      : 'LOOMORA_WINDOWS_UPDATE_URL';
  const value = String(
    process.env[environmentKey] || UPDATE_FEED_URLS[process.platform] || '',
  ).trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (PLACEHOLDER_HOSTS.has(url.hostname)) return '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function manifestName() {
  return process.platform === 'darwin' ? 'latest-mac.yml' : 'latest.yml';
}

function assetName(asset) {
  return String(asset?.name || asset?.filename || '').trim();
}

function assetDownloadUrl(asset) {
  return String(
    asset?.browser_download_url ||
      asset?.download_url ||
      asset?.url ||
      asset?.direct_asset_url ||
      '',
  ).trim();
}

async function resolveReleaseFeed() {
  const errors = [];
  for (const source of RELEASE_SOURCES) {
    try {
      const response = await net.fetch(source.api, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Loomora-updater',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const release = await response.json();
      const assets = Array.isArray(release?.assets) ? release.assets : [];
      const manifest = assets.find(
        (asset) => assetName(asset) === manifestName(),
      );
      const manifestUrl = assetDownloadUrl(manifest);
      if (!manifestUrl) {
        throw new Error(`未找到 ${manifestName()}`);
      }
      return {
        url: new URL('.', manifestUrl).toString().replace(/\/$/, ''),
        source: source.label,
      };
    } catch (error) {
      errors.push(`${source.label}: ${error?.message || '无法访问'}`);
    }
  }
  throw new Error(`更新源暂不可用（${errors.join('；')}）`);
}

function currentState() {
  return {
    status: state.status,
    message: state.message,
    version: state.version,
    progress: state.progress,
    source: state.source,
  };
}

function publish(nextState) {
  state = { ...state, ...nextState };
  const window = getWindow();
  if (!window || window.isDestroyed()) return;
  window.webContents.send('update-status', currentState());
}

function isSupportedRuntime() {
  return app.isPackaged && ['win32', 'darwin'].includes(process.platform);
}

function disabledState() {
  if (!app.isPackaged) {
    return { status: 'disabled', message: '开发环境不检查更新' };
  }
  if (!['win32', 'darwin'].includes(process.platform)) {
    return { status: 'disabled', message: '当前平台暂不支持自动更新' };
  }
  return null;
}

function setupUpdater() {
  if (initialized) return;
  initialized = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('checking-for-update', () =>
    publish({ status: 'checking', message: '正在检查更新...', progress: 0 }),
  );
  autoUpdater.on('update-available', (info) =>
    publish({
      status: 'available',
      message: `发现新版本 v${info?.version || ''}`.trim(),
      version: String(info?.version || ''),
      info,
      progress: 0,
    }),
  );
  autoUpdater.on('update-not-available', (info) =>
    publish({
      status: 'latest',
      message: '当前已是最新版本',
      version: String(info?.version || app.getVersion()),
      info,
      progress: 100,
    }),
  );
  autoUpdater.on('download-progress', (progress) =>
    publish({
      status: 'downloading',
      message: `正在下载更新 ${Math.round(progress?.percent || 0)}%`,
      progress: Math.max(0, Math.min(100, Number(progress?.percent || 0))),
    }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    publish({
      status: 'downloaded',
      message: '更新已下载，重启后安装',
      version: String(info?.version || state.version || ''),
      info,
      progress: 100,
    }),
  );
  autoUpdater.on('error', (error) =>
    publish({
      status: 'error',
      message: String(error?.message || '检查更新失败'),
      progress: 0,
    }),
  );
}

async function checkForUpdates() {
  const disabled = disabledState();
  if (disabled || !isSupportedRuntime()) {
    publish(disabled);
    return currentState();
  }
  setupUpdater();
  try {
    const configuredUrl = configuredFeedUrl();
    const feed = configuredUrl
      ? { url: configuredUrl, source: '自定义更新源' }
      : await resolveReleaseFeed();
    publish({ source: feed.source });
    autoUpdater.setFeedURL({ provider: 'generic', url: feed.url });
    await autoUpdater.checkForUpdates();
  } catch (error) {
    publish({
      status: 'error',
      message: String(error?.message || '检查更新失败'),
    });
  }
  return currentState();
}

async function downloadUpdate() {
  if (state.status !== 'available') return currentState();
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    publish({
      status: 'error',
      message: String(error?.message || '下载更新失败'),
    });
  }
  return currentState();
}

function installUpdate() {
  if (state.status !== 'downloaded') return false;
  autoUpdater.quitAndInstall(false, true);
  return true;
}

function registerUpdateHandlers(windowGetter) {
  getWindow = typeof windowGetter === 'function' ? windowGetter : getWindow;
  return {
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    getState: () => currentState(),
  };
}

module.exports = { registerUpdateHandlers };
