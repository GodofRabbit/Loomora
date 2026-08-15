const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const electronPath = require('electron');
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
const watchTargets = ['main.js', 'preload.js', 'electron'];

let electronProcess = null;
let isRestarting = false;
let restartTimer = null;
const watchers = [];

function startElectron() {
  const electronEnv = {
    ...process.env,
    VITE_DEV_SERVER_URL: devServerUrl,
  };
  delete electronEnv.ELECTRON_RUN_AS_NODE;

  electronProcess = spawn(electronPath, ['.'], {
    cwd: appRoot,
    stdio: 'inherit',
    env: electronEnv,
  });

  electronProcess.on('exit', (code, signal) => {
    if (isRestarting) return;
    closeWatchers();
    process.exit(code ?? (signal ? 1 : 0));
  });
}

function stopElectron(callback) {
  if (!electronProcess || electronProcess.killed) {
    callback();
    return;
  }

  isRestarting = true;
  const currentProcess = electronProcess;
  const forceKillTimer = setTimeout(() => {
    if (!currentProcess.killed) currentProcess.kill('SIGKILL');
  }, 3000);
  forceKillTimer.unref();

  currentProcess.once('exit', () => {
    clearTimeout(forceKillTimer);
    if (electronProcess === currentProcess) electronProcess = null;
    isRestarting = false;
    callback();
  });

  currentProcess.kill();
}

function scheduleRestart(label) {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    console.log(`\n[dev] ${label} changed, restarting Electron...`);
    stopElectron(startElectron);
  }, 180);
}

function watchFile(targetPath) {
  const watcher = fs.watch(targetPath, (eventType) => {
    if (eventType === 'change' || eventType === 'rename') {
      scheduleRestart(path.relative(appRoot, targetPath));
    }
  });
  watchers.push(watcher);
}

function watchDirectory(targetPath) {
  try {
    const watcher = fs.watch(
      targetPath,
      { recursive: true },
      (_eventType, fileName) => {
        if (!fileName) return;
        scheduleRestart(
          path.join(path.relative(appRoot, targetPath), String(fileName)),
        );
      },
    );
    watchers.push(watcher);
  } catch {
    watchDirectoryTree(targetPath);
  }
}

function watchDirectoryTree(targetPath) {
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) watchDirectoryTree(entryPath);
  }

  const watcher = fs.watch(targetPath, (_eventType, fileName) => {
    if (!fileName) return;
    scheduleRestart(
      path.join(path.relative(appRoot, targetPath), String(fileName)),
    );
  });
  watchers.push(watcher);
}

function watchTarget(relativePath) {
  const targetPath = path.join(appRoot, relativePath);
  if (!fs.existsSync(targetPath)) return;
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    watchDirectory(targetPath);
  } else {
    watchFile(targetPath);
  }
}

function closeWatchers() {
  for (const watcher of watchers) watcher.close();
  watchers.length = 0;
}

function shutdown() {
  closeWatchers();
  stopElectron(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

for (const target of watchTargets) watchTarget(target);
startElectron();
