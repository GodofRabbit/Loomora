const {
  app,
  ipcMain,
  dialog,
  clipboard,
  nativeImage,
  shell,
} = require('electron');
const path = require('path');
const fs = require('fs');

const APP_ROOT = path.resolve(__dirname, '..');
const IMAGE_PATTERN = /\.(png|jpe?g|webp)$/i;
const OCR_MODEL_FILES = new Set([
  'detection/model.json',
  'detection/chunk_1.dat',
  'recognition/model.json',
  'recognition/chunk_1.dat',
  'recognition/chunk_2.dat',
]);

function galleryRoots() {
  return [
    path.resolve(
      app.isPackaged ? path.dirname(process.execPath) : APP_ROOT,
      'Gallery',
    ),
    path.resolve(app.getPath('userData'), 'Gallery'),
  ];
}

function galleryDir() {
  const date = new Date().toLocaleDateString('en-CA');
  let directory = path.join(galleryRoots()[0], date);
  try {
    fs.mkdirSync(directory, { recursive: true });
  } catch {
    // Installed applications may not be allowed to write beside the executable.
    directory = path.join(galleryRoots()[1], date);
    fs.mkdirSync(directory, { recursive: true });
  }
  return directory;
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return Boolean(
    relative && !relative.startsWith(`..${path.sep}`) && relative !== '..',
  );
}

function isGalleryImage(filePath) {
  const target = path.resolve(filePath || '');
  return (
    IMAGE_PATTERN.test(target) &&
    galleryRoots().some((root) => isInside(root, target))
  );
}

function mimeFromPath(filePath) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  if (extension === 'jpg') return 'image/jpeg';
  return `image/${extension}`;
}

function galleryItem(filePath, buffer = fs.readFileSync(filePath)) {
  const stat = fs.statSync(filePath);
  return {
    name: path.basename(filePath),
    date: path.basename(path.dirname(filePath)),
    path: filePath,
    data: `data:${mimeFromPath(filePath)};base64,${buffer.toString('base64')}`,
    createdAt: stat.mtimeMs,
  };
}

function listGallery() {
  const files = [];
  for (const root of new Set(galleryRoots())) {
    if (!fs.existsSync(root)) continue;
    const dateDirectories = fs.readdirSync(root, { withFileTypes: true });
    for (const dateDirectory of dateDirectories) {
      if (!dateDirectory.isDirectory()) continue;
      const directory = path.join(root, dateDirectory.name);
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isFile() || !IMAGE_PATTERN.test(entry.name)) continue;
        files.push(galleryItem(path.join(directory, entry.name)));
      }
    }
  }
  return files.sort(
    (a, b) =>
      String(b.date).localeCompare(String(a.date)) ||
      b.createdAt - a.createdAt ||
      b.name.localeCompare(a.name),
  );
}

function availableImportPath(directory, fileName) {
  const parsed = path.parse(path.basename(fileName));
  let candidate = path.join(directory, `${parsed.name}${parsed.ext}`);
  for (let suffix = 1; fs.existsSync(candidate); suffix++) {
    candidate = path.join(directory, `${parsed.name}-${suffix}${parsed.ext}`);
  }
  return candidate;
}

function importGalleryFiles(filePaths) {
  const directory = galleryDir();
  const items = [];
  const failed = [];
  for (const inputPath of filePaths) {
    const sourcePath = path.resolve(String(inputPath || ''));
    try {
      if (
        !IMAGE_PATTERN.test(sourcePath) ||
        !fs.statSync(sourcePath).isFile()
      ) {
        throw new Error('仅支持 JPG、PNG 和 WEBP 图片');
      }
      if (nativeImage.createFromPath(sourcePath).isEmpty()) {
        throw new Error('图片文件无效或已损坏');
      }
      const targetPath = availableImportPath(
        directory,
        path.basename(sourcePath),
      );
      fs.copyFileSync(sourcePath, targetPath);
      const importedAt = new Date();
      fs.utimesSync(targetPath, importedAt, importedAt);
      items.push(galleryItem(targetPath));
    } catch (error) {
      failed.push({
        name: path.basename(sourcePath) || '未知文件',
        error: error?.message || '导入失败',
      });
    }
  }
  return { canceled: false, items, failed };
}

function requestHeaders(key) {
  return { Authorization: `Bearer ${key}` };
}

async function downloadRemoteImage(url, key) {
  const response = await fetch(url, { headers: requestHeaders(key) });
  if (!response.ok) throw new Error(`下载图片失败（${response.status}）`);
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mime: response.headers.get('content-type')?.split(';')[0],
  };
}

async function saveGeneratedImages(items, { base, key, taskId, count }) {
  const directory = galleryDir();
  const images = [];
  const localPaths = [];
  const total = Math.max(items.length, taskId ? count : 0);

  for (let index = 0; index < total; index++) {
    const item = items[index] || {};
    let buffer;
    let mime = item.mime_type || 'image/png';
    const base64 = item.b64_json || item.base64;
    const url = item.url || item.image_url;

    if (base64) {
      buffer = Buffer.from(base64.replace(/^data:[^,]+,/, ''), 'base64');
    } else if (url) {
      const downloaded = await downloadRemoteImage(url, key);
      buffer = downloaded.buffer;
      mime =
        downloaded.mime ||
        (/\.jpe?g(?:\?|$)/i.test(url)
          ? 'image/jpeg'
          : /\.webp(?:\?|$)/i.test(url)
            ? 'image/webp'
            : 'image/png');
    } else if (taskId) {
      const downloaded = await downloadRemoteImage(
        `${base}/v1/images/tasks/${taskId}/content?index=${index}`,
        key,
      );
      buffer = downloaded.buffer;
      mime = downloaded.mime || mime;
    } else {
      continue;
    }

    const extension = mime.includes('jpeg')
      ? 'jpg'
      : mime.includes('webp')
        ? 'webp'
        : 'png';
    const filePath = path.join(
      directory,
      `loomora-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${index + 1}.${extension}`,
    );
    fs.writeFileSync(filePath, buffer);
    localPaths.push(filePath);
    images.push(`data:${mime};base64,${buffer.toString('base64')}`);
  }

  return { images, localPaths, folder: directory };
}

function registerGalleryHandlers() {
  ipcMain.handle('pick-image', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    return {
      name: path.basename(filePath),
      data: `data:${mimeFromPath(filePath)};base64,${fs.readFileSync(filePath).toString('base64')}`,
    };
  });

  ipcMain.handle('list-gallery', async () => listGallery());

  ipcMain.handle('import-gallery-images', async (_event, filePaths) => {
    let selectedPaths = filePaths;
    if (!Array.isArray(selectedPaths)) {
      const result = await dialog.showOpenDialog({
        title: '导入图片到作品库',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      });
      if (result.canceled || !result.filePaths.length) {
        return { canceled: true, items: [], failed: [] };
      }
      selectedPaths = result.filePaths;
    }
    return importGalleryFiles(selectedPaths);
  });

  ipcMain.handle('copy-image', async (_event, source) => {
    const image = nativeImage.createFromDataURL(source);
    if (image.isEmpty()) throw new Error('无法复制图片');
    clipboard.writeImage(image);
    return true;
  });

  ipcMain.handle('copy-text', async (_event, text) => {
    clipboard.writeText(String(text || ''));
    return true;
  });

  ipcMain.handle('read-ocr-model', async (_event, relativePath) => {
    const normalized = String(relativePath || '').replace(/\\/g, '/');
    if (!OCR_MODEL_FILES.has(normalized)) {
      throw new Error('无效的 OCR 模型文件');
    }
    const rendererRoot = process.env.VITE_DEV_SERVER_URL
      ? path.join(APP_ROOT, 'renderer', 'public')
      : path.join(APP_ROOT, 'renderer-dist');
    return fs.readFileSync(
      path.join(rendererRoot, 'models', 'ocr', ...normalized.split('/')),
    );
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
      ) {
        throw new Error('图片数据无效');
      }
      const image = nativeImage.createFromDataURL(dataUrl);
      if (image.isEmpty()) throw new Error('图片数据无效');
      const mime = dataUrl.match(/^data:image\/(png|jpeg|webp)/i)?.[1];
      if (mime === 'jpeg') {
        buffer = image.toJPEG(95);
        extension = 'jpg';
      } else {
        buffer = image.toPNG();
      }
    }

    const requestedName = path.basename(String(payload?.name || ''));
    const defaultName = requestedName
      ? `${path.basename(requestedName, path.extname(requestedName))}.${extension}`
      : `loomora-${Date.now()}.${extension}`;
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
    if (!isGalleryImage(sourcePath) || !fs.existsSync(sourcePath)) {
      throw new Error('作品图片路径无效');
    }
    const dataUrl = String(payload?.dataUrl || '');
    if (
      !dataUrl.startsWith('data:image/') ||
      dataUrl.length > 140 * 1024 * 1024
    ) {
      throw new Error('编辑后的图片数据无效');
    }
    const editedImage = nativeImage.createFromDataURL(dataUrl);
    if (editedImage.isEmpty()) throw new Error('编辑后的图片数据无效');
    const buffer = editedImage.toPNG();
    if (!buffer.length || buffer.length > 100 * 1024 * 1024) {
      throw new Error('编辑后的图片为空或过大');
    }

    const stem = path.basename(sourcePath, path.extname(sourcePath));
    const result = await dialog.showSaveDialog({
      title: '另存为新图',
      defaultPath: path.join(galleryDir(), `${stem}-edited-${Date.now()}.png`),
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    const targetPath = path.extname(result.filePath)
      ? result.filePath
      : `${result.filePath}.png`;
    fs.writeFileSync(targetPath, buffer);

    // Only persistent gallery locations should appear in the in-memory gallery.
    const parentRoot = path.resolve(path.dirname(path.dirname(targetPath)));
    const isInGalleryDateDirectory = galleryRoots().some(
      (root) => path.relative(root, parentRoot) === '',
    );
    return {
      saved: true,
      path: targetPath,
      item: isInGalleryDateDirectory ? galleryItem(targetPath, buffer) : null,
    };
  });

  ipcMain.handle('delete-image', async (_event, filePath) => {
    const target = path.resolve(filePath || '');
    if (!isGalleryImage(target)) throw new Error('作品图片路径无效');
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
    if (!fs.existsSync(target)) throw new Error('图片文件不存在');
    shell.showItemInFolder(target);
    return true;
  });
}

module.exports = { registerGalleryHandlers, saveGeneratedImages };
