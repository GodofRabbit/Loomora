const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const SIZES = {
  '1:1': '1024x1024',
  '16:9': '1024x576',
  '9:16': '576x1024',
  '4:3': '1024x768',
  '3:4': '768x1024',
  '3:2': '1024x683',
  '2:3': '683x1024',
  '21:9': '1024x439',
};
const headers = (key, json = false) => ({
  Authorization: `Bearer ${key}`,
  ...(json ? { 'Content-Type': 'application/json' } : {}),
});
const taskIdOf = (d) => d?.task_id || d?.id || d?.data?.task_id || d?.data?.id;
const statusOf = (d) =>
  String(d?.status || d?.data?.status || d?.task?.status || '').toLowerCase();
function imagesOf(d) {
  if (d?.result_url) return [{ url: d.result_url }];
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.data?.data)) return d.data.data;
  if (d?.data?.data && typeof d.data.data === 'object') return [d.data.data];
  for (const k of ['url', 'image_url', 'b64_json', 'base64'])
    if (d?.[k]) return [d];
  return [];
}
function galleryDir() {
  const date = new Date().toLocaleDateString('en-CA');
  let dir = path.join(
    app.isPackaged ? path.dirname(process.execPath) : __dirname,
    'Gallery',
    date,
  );
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    dir = path.join(app.getPath('userData'), 'Gallery', date);
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
async function download(url, key) {
  const r = await fetch(url, { headers: headers(key) });
  if (!r.ok) throw new Error(`下载图片失败 (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}
async function saveImages(items, { base, key, taskId, count }) {
  const dir = galleryDir(),
    images = [],
    localPaths = [],
    total = Math.max(items.length, taskId ? count : 0);
  for (let i = 0; i < total; i++) {
    const item = items[i] || {};
    let buffer,
      mime = item.mime_type || 'image/png';
    const b64 = item.b64_json || item.base64,
      url = item.url || item.image_url;
    if (b64) buffer = Buffer.from(b64.replace(/^data:[^,]+,/, ''), 'base64');
    else if (url) {
      buffer = await download(url, key);
      mime = /\.jpe?g(?:\?|$)/i.test(url)
        ? 'image/jpeg'
        : /\.webp(?:\?|$)/i.test(url)
          ? 'image/webp'
          : 'image/png';
    } else if (taskId)
      buffer = await download(
        `${base}/v1/images/tasks/${taskId}/content?index=${i}`,
        key,
      );
    else continue;
    const ext = mime.includes('jpeg')
        ? 'jpg'
        : mime.includes('webp')
          ? 'webp'
          : 'png',
      file = path.join(dir, `loomora-${Date.now()}-${i + 1}.${ext}`);
    fs.writeFileSync(file, buffer);
    localPaths.push(file);
    images.push(`data:${mime};base64,${buffer.toString('base64')}`);
  }
  return { images, localPaths, folder: dir };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#070817',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  process.env.VITE_DEV_SERVER_URL
    ? win.loadURL(process.env.VITE_DEV_SERVER_URL)
    : win.loadFile(path.join(__dirname, 'renderer-dist', 'index.html'));
}
app.whenReady().then(() => {
  createWindow();
  app.on(
    'activate',
    () => BrowserWindow.getAllWindows().length === 0 && createWindow(),
  );
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
ipcMain.handle('pick-image', async () => {
  const r = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0],
    ext = path.extname(p).slice(1).replace('jpg', 'jpeg');
  return {
    name: path.basename(p),
    data: `data:image/${ext};base64,${fs.readFileSync(p).toString('base64')}`,
  };
});

ipcMain.handle('generate', async (_e, p) => {
  if (!p.apiKey) return { ok: false, error: '请先填写 API Key' };
  if (!p.prompt?.trim()) return { ok: false, error: '请输入提示词' };
  const base = (p.endpoint || 'https://www.zexitongxue.com').replace(/\/$/, '');
  try {
    const body = {
      model: p.model || 'gpt-image-2',
      prompt: p.prompt.trim(),
      size: SIZES[p.aspect] || p.aspect || '1024x1024',
      quality: 'high',
      n: Math.max(1, Number(p.count) || 1),
    };
    if (p.reference?.length) {
      body.reference_images = p.reference.map((x) => x.data);
      body.reference_image = p.reference[0].data;
    }
    const res = await fetch(`${base}/v1/images/generations/async`, {
        method: 'POST',
        headers: headers(p.apiKey, true),
        body: JSON.stringify(body),
      }),
      text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`接口返回非 JSON (${res.status}): ${text.slice(0, 180)}`);
    }
    if (!res.ok)
      throw new Error(
        json?.error?.message || json?.message || `提交失败 (${res.status})`,
      );
    const taskId = taskIdOf(json);
    if (!taskId) {
      const items = imagesOf(json);
      if (!items.length) throw new Error('接口未返回 task_id 或图片数据');
      return {
        ok: true,
        ...(await saveImages(items, { base, key: p.apiKey, count: body.n })),
      };
    }
    let last = {};
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const q = await fetch(`${base}/v1/images/tasks/${taskId}`, {
        headers: headers(p.apiKey),
      });
      if (!q.ok) continue;
      last = await q.json();
      const state = statusOf(last);
      if (['succeeded', 'completed', 'success'].includes(state))
        return {
          ok: true,
          ...(await saveImages(imagesOf(last), {
            base,
            key: p.apiKey,
            taskId,
            count: body.n,
          })),
        };
      if (['failed', 'error', 'cancelled', 'canceled'].includes(state))
        throw new Error(
          last?.error?.message || last?.message || `任务失败: ${state}`,
        );
    }
    throw new Error(`任务轮询超时，最后状态：${statusOf(last) || '未知'}`);
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
