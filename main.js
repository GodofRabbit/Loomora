const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  clipboard,
  nativeImage,
  shell,
} = require('electron');
const path = require('path');
const fs = require('fs');

const OCR_MODEL_FILES = new Set([
  'detection/model.json',
  'detection/chunk_1.dat',
  'recognition/model.json',
  'recognition/chunk_1.dat',
  'recognition/chunk_2.dat',
]);

const GPT_IMAGE_SIZES = {
  '1:1': '1024x1024',
  '16:9': '2048x1152',
  '9:16': '2160x3840',
  '4:3': '1536x1024',
  '3:4': '1024x1536',
  '3:2': '1536x1024',
};
const GPT_IMAGE_SIZE_VALUES = new Set([
  '1024x1024',
  '1536x1024',
  '1024x1536',
  '2048x1152',
  '3840x2160',
  '2160x3840',
  'auto',
]);
const MODEL_ALIASES = {
  'dall-e': 'gpt-image-2',
  'dall-e-2': 'gpt-image-2',
  'dall-e-3': 'grok-imagine-image-pro',
  'nano-banana': 'gemini-3.1-flash-image-preview',
  'nano-banana2': 'gemini-3.1-flash-image-preview',
  'nano-banana-2': 'gemini-3.1-flash-image-preview',
  'nano-banana-pro': 'gemini-3-pro-image-preview',
  'grok-imagine-image-quality': 'grok-imagine-image-pro',
};
const normalizeModel = (model) => MODEL_ALIASES[model] || model;
function referenceLimit(model) {
  if (model === 'gpt-image-2') return 14;
  if (model.startsWith('gemini-')) return 4;
  if (model === 'grok-imagine-image-edit') return 3;
  if (model === 'grok-imagine-image-lite') return 0;
  if (model.startsWith('grok-imagine-image')) return 1;
  return 14;
}
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
  if (d?.data && typeof d.data === 'object') {
    const nested = imagesOf(d.data);
    if (nested.length) return nested;
  }
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
function galleryRoots() {
  return [
    path.resolve(
      app.isPackaged ? path.dirname(process.execPath) : __dirname,
      'Gallery',
    ),
    path.resolve(app.getPath('userData'), 'Gallery'),
  ];
}
function isGalleryImage(filePath) {
  const target = path.resolve(filePath || '');
  return (
    /\.(png|jpe?g|webp)$/i.test(target) &&
    galleryRoots().some(
      (root) => target.startsWith(`${root}${path.sep}`) && target !== root,
    )
  );
}
async function download(url, key) {
  const r = await fetch(url, { headers: headers(key) });
  if (!r.ok) throw new Error(`下载图片失败 (${r.status})`);
  return {
    buffer: Buffer.from(await r.arrayBuffer()),
    mime: r.headers.get('content-type')?.split(';')[0],
  };
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
      const downloaded = await download(url, key);
      buffer = downloaded.buffer;
      mime =
        downloaded.mime ||
        (/\.jpe?g(?:\?|$)/i.test(url)
          ? 'image/jpeg'
          : /\.webp(?:\?|$)/i.test(url)
            ? 'image/webp'
            : 'image/png');
    } else if (taskId) {
      const downloaded = await download(
        `${base}/v1/images/tasks/${taskId}/content?index=${i}`,
        key,
      );
      buffer = downloaded.buffer;
      mime = downloaded.mime || mime;
    } else continue;
    const ext = mime.includes('jpeg')
        ? 'jpg'
        : mime.includes('webp')
          ? 'webp'
          : 'png',
      file = path.join(
        dir,
        `loomora-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i + 1}.${ext}`,
      );
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

ipcMain.handle('list-gallery', async () => {
  const roots = [
    path.join(
      app.isPackaged ? path.dirname(process.execPath) : __dirname,
      'Gallery',
    ),
    path.join(app.getPath('userData'), 'Gallery'),
  ];
  const files = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const date of fs.readdirSync(root)) {
      const dir = path.join(root, date);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const name of fs.readdirSync(dir)) {
        if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
        const file = path.join(dir, name);
        files.push({
          name,
          date,
          path: file,
          data: `data:image/${path.extname(name).slice(1).replace('jpg', 'jpeg')};base64,${fs.readFileSync(file).toString('base64')}`,
          createdAt: fs.statSync(file).mtimeMs,
        });
      }
    }
  }
  return files.sort((a, b) => b.createdAt - a.createdAt);
});

ipcMain.handle('copy-image', async (_event, src) => {
  const image = nativeImage.createFromDataURL(src);
  if (image.isEmpty()) throw new Error('Unable to copy image');
  clipboard.writeImage(image);
  return true;
});

ipcMain.handle('copy-text', async (_event, text) => {
  clipboard.writeText(String(text || ''));
  return true;
});

ipcMain.handle('read-ocr-model', async (_event, relativePath) => {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (!OCR_MODEL_FILES.has(normalized)) throw new Error('无效的 OCR 模型文件');
  const rendererRoot = process.env.VITE_DEV_SERVER_URL
    ? path.join(__dirname, 'renderer', 'public')
    : path.join(__dirname, 'renderer-dist');
  const modelPath = path.join(
    rendererRoot,
    'models',
    'ocr',
    ...normalized.split('/'),
  );
  return fs.readFileSync(modelPath);
});

ipcMain.handle('download-image', async (_event, payload) => {
  const sourcePath = path.resolve(payload?.filePath || '');
  let buffer;
  let extension = 'png';
  if (isGalleryImage(sourcePath) && fs.existsSync(sourcePath)) {
    buffer = fs.readFileSync(sourcePath);
    extension = path.extname(sourcePath).slice(1).toLowerCase() || 'png';
  } else {
    const dataUrl = String(payload?.src || '');
    if (
      !dataUrl.startsWith('data:image/') ||
      dataUrl.length > 140 * 1024 * 1024
    )
      throw new Error('Invalid image data');
    const image = nativeImage.createFromDataURL(dataUrl);
    if (image.isEmpty()) throw new Error('Invalid image data');
    const mime = dataUrl.match(/^data:image\/(png|jpeg|webp)/i)?.[1];
    if (mime === 'jpeg') {
      buffer = image.toJPEG(95);
      extension = 'jpg';
    } else {
      buffer = image.toPNG();
      extension = 'png';
    }
  }
  const requestedName = path.basename(String(payload?.name || ''));
  const fallbackName = `loomora-${Date.now()}.${extension}`;
  const defaultName = requestedName
    ? `${path.basename(requestedName, path.extname(requestedName))}.${extension}`
    : fallbackName;
  const result = await dialog.showSaveDialog({
    title: '保存图片',
    defaultPath: path.join(app.getPath('pictures'), defaultName),
    filters: [
      {
        name: extension === 'jpg' ? 'JPEG 图片' : 'PNG 图片',
        extensions: [extension],
      },
    ],
  });
  if (result.canceled || !result.filePath) return { saved: false };
  const targetPath = path.extname(result.filePath)
    ? result.filePath
    : `${result.filePath}.${extension}`;
  fs.writeFileSync(targetPath, buffer);
  return { saved: true, path: targetPath };
});

ipcMain.handle('save-edited-image', async (_event, payload) => {
  const sourcePath = path.resolve(payload?.sourcePath || '');
  if (!isGalleryImage(sourcePath) || !fs.existsSync(sourcePath))
    throw new Error('Invalid gallery image path');
  const dataUrl = String(payload?.dataUrl || '');
  if (!dataUrl.startsWith('data:image/') || dataUrl.length > 140 * 1024 * 1024)
    throw new Error('Invalid edited image data');
  const editedImage = nativeImage.createFromDataURL(dataUrl);
  if (editedImage.isEmpty()) throw new Error('Invalid edited image data');
  const buffer = editedImage.toPNG();
  if (!buffer.length || buffer.length > 100 * 1024 * 1024)
    throw new Error('Edited image is empty or too large');
  const stem = path.basename(sourcePath, path.extname(sourcePath));
  const file = path.join(
    path.dirname(sourcePath),
    `${stem}-edited-${Date.now()}.png`,
  );
  fs.writeFileSync(file, buffer, { flag: 'wx' });
  const stat = fs.statSync(file);
  return {
    name: path.basename(file),
    date: path.basename(path.dirname(file)),
    path: file,
    data: `data:image/png;base64,${buffer.toString('base64')}`,
    createdAt: stat.mtimeMs,
  };
});

ipcMain.handle('delete-image', async (_event, filePath) => {
  const target = path.resolve(filePath || '');
  if (!isGalleryImage(target)) throw new Error('Invalid gallery image path');
  if (!fs.existsSync(target)) return { deleted: false };
  const confirmation = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['删除', '取消'],
    defaultId: 1,
    cancelId: 1,
    title: '删除图片',
    message: '确定要永久删除这张图片吗？',
    detail: path.basename(target),
  });
  if (confirmation.response !== 0) return { deleted: false };
  fs.unlinkSync(target);
  return { deleted: true };
});

ipcMain.handle('show-image-in-folder', async (_event, filePath) => {
  const target = path.resolve(filePath || '');
  if (!fs.existsSync(target)) throw new Error('Image file not found');
  shell.showItemInFolder(target);
  return true;
});

async function generateOne(p, batchIndex, event) {
  const report = (message) => {
    if (!event.sender.isDestroyed())
      event.sender.send('generation-status', message);
  };
  console.log('[Loomora] generate IPC received', {
    endpoint: p?.endpoint,
    model: p?.model,
    hasKey: Boolean(p?.apiKey),
    promptLength: p?.prompt?.length,
    batchIndex,
  });
  if (!p.apiKey) return { ok: false, error: '请先填写 API Key' };
  if (!p.prompt?.trim()) return { ok: false, error: '请输入提示词' };
  let base;
  try {
    const endpoint = new URL(p.endpoint || 'https://www.zexitongxue.com');
    base = endpoint.origin;
    const model = normalizeModel(p.model?.trim() || 'gpt-image-2');
    const isGptImage = model === 'gpt-image-2';
    const isGemini = model.startsWith('gemini-');
    const references = Array.isArray(p.reference) ? p.reference : [];
    const maxReferences = referenceLimit(model);
    if (references.length > maxReferences)
      throw new Error(
        `${model} supports at most ${maxReferences} reference image${maxReferences === 1 ? '' : 's'}`,
      );
    const size = isGptImage
      ? GPT_IMAGE_SIZE_VALUES.has(p.size)
        ? p.size
        : GPT_IMAGE_SIZES[p.aspect] || '1024x1024'
      : (p.size && p.size.includes(':') ? p.size : p.aspect) || '1:1';
    const gptQuality = ['low', 'medium', 'high', 'auto'].includes(p.quality)
      ? p.quality
      : 'auto';
    const geminiQuality = ['1K', '2K', '4K'].includes(p.quality)
      ? p.quality
      : '2K';
    const body = {
      model,
      prompt: p.prompt.trim(),
      size,
      ...(isGptImage
        ? { quality: gptQuality }
        : isGemini
          ? { quality: geminiQuality === '4K' ? '2K' : geminiQuality }
          : {}),
      n: 1,
    };
    if (isGemini && geminiQuality === '4K') {
      body.extra_body = {
        google: {
          image_config: { aspect_ratio: size, image_size: '4K' },
        },
      };
    }
    if (references.length) {
      const imageUrls = references.map((x) => x.data);
      body.image_url = imageUrls.length === 1 ? imageUrls[0] : imageUrls;
    }
    const requestUrl = `${base}/v1/images/generations/async`;
    console.log(
      `[Loomora] POST batch ${batchIndex + 1}`,
      requestUrl,
      JSON.stringify(body),
    );
    report(`Sending request ${batchIndex + 1}...`);
    const response = fetch(requestUrl, {
      method: 'POST',
      headers: headers(p.apiKey, true),
      body: JSON.stringify(body),
    });
    report(`Request ${batchIndex + 1} sent`);
    const res = await response,
      text = await res.text();
    console.log('[Loomora] image response', res.status, res.statusText);
    console.log('[Loomora] image response body', text.slice(0, 2000));
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
    report(`Request ${batchIndex + 1} accepted; generating image...`);
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const q = await fetch(`${base}/v1/images/tasks/${taskId}`, {
        headers: headers(p.apiKey),
      });
      console.log('[Loomora] task response', q.status);
      const queryText = await q.text();
      try {
        last = JSON.parse(queryText);
      } catch {
        if (!q.ok) throw new Error(`Task query failed (${q.status})`);
        continue;
      }
      if (!q.ok)
        throw new Error(
          last?.error?.message ||
            last?.message ||
            `Task query failed (${q.status})`,
        );
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
}

ipcMain.handle('generate', async (event, p) => {
  const total = Math.min(4, Math.max(1, Number(p.count) || 1));
  console.log(`[Loomora] starting ${total} generation request(s)`);
  const results = [];
  for (let index = 0; index < total; index++) {
    results.push(await generateOne(p, index, event));
  }
  const successful = results.filter((result) => result.ok);
  const failed = results
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => !result.ok);
  return {
    ok: successful.length > 0,
    images: successful.flatMap((result) => result.images || []),
    localPaths: successful.flatMap((result) => result.localPaths || []),
    folder: successful.find((result) => result.folder)?.folder,
    error: failed.length
      ? failed
          .map(({ result, index }) => `#${index + 1}: ${result.error}`)
          .join('; ')
      : undefined,
    failedCount: failed.length,
  };
});
