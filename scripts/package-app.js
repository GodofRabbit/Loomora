const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const builderCli = require.resolve('electron-builder/cli.js');

function builderArguments() {
  const requestedPlatform = process.argv[2];
  if (requestedPlatform === '--win') return ['--win', 'nsis'];
  if (requestedPlatform === '--mac') return ['--mac', 'dmg'];
  if (requestedPlatform) {
    throw new Error(`不支持的打包平台参数：${requestedPlatform}`);
  }
  if (process.platform === 'win32') return ['--win', 'nsis'];
  if (process.platform === 'darwin') return ['--mac', 'dmg'];
  return [];
}

function runBuilder(args) {
  return new Promise((resolve, reject) => {
    const output = [];
    const child = spawn(process.execPath, [builderCli, ...args], {
      cwd: appRoot,
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    for (const [stream, destination] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ]) {
      stream.on('data', (chunk) => {
        output.push(chunk);
        destination.write(chunk);
      });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 1, output: Buffer.concat(output).toString() });
    });
  });
}

function windowsBuilderCacheRoot() {
  if (process.env.ELECTRON_BUILDER_CACHE) {
    return path.resolve(process.env.ELECTRON_BUILDER_CACHE);
  }
  const localAppData = process.env.LOCALAPPDATA;
  return localAppData
    ? path.join(localAppData, 'electron-builder', 'Cache')
    : path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache');
}

function repairWinCodeSignCache(output) {
  if (process.platform !== 'win32') return false;
  if (!/Cannot create symbolic link|创建符号链接|符号链接权限/i.test(output)) {
    return false;
  }

  const version = output.match(/winCodeSign-(\d+(?:\.\d+)+)/i)?.[1];
  if (!version) return false;

  const cacheRoot = path.join(windowsBuilderCacheRoot(), 'winCodeSign');
  const target = path.join(cacheRoot, `winCodeSign-${version}`);
  if (fs.existsSync(path.join(target, 'rcedit-x64.exe'))) return true;

  const candidates = fs
    .readdirSync(cacheRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        /^\d+$/.test(entry.name) &&
        fs.existsSync(path.join(cacheRoot, entry.name, 'rcedit-x64.exe')),
    )
    .map((entry) => ({
      path: path.join(cacheRoot, entry.name),
      modifiedAt: fs.statSync(path.join(cacheRoot, entry.name)).mtimeMs,
    }))
    .sort((left, right) => right.modifiedAt - left.modifiedAt);

  if (!candidates.length) return false;

  // The archive contains two macOS symlinks that non-admin Windows cannot
  // create. All Windows tools are already extracted before 7-Zip reports the
  // error, so copy that verified extraction into electron-builder's cache key.
  fs.cpSync(candidates[0].path, target, { recursive: true });
  if (!fs.existsSync(path.join(target, 'rcedit-x64.exe'))) return false;

  console.log(
    '\n[package] 已修复 winCodeSign 缓存，正在自动重试 Windows 打包。\n',
  );
  return true;
}

async function main() {
  const args = builderArguments();
  const firstRun = await runBuilder(args);
  if (firstRun.code === 0) return;

  if (repairWinCodeSignCache(firstRun.output)) {
    const retry = await runBuilder(args);
    if (retry.code === 0) return;
    process.exitCode = retry.code;
    return;
  }

  process.exitCode = firstRun.code;
}

main().catch((error) => {
  console.error(`[package] ${error.stack || error.message || error}`);
  process.exitCode = 1;
});
