<script setup>
import {
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from 'vue';
import DropdownSelect from './components/DropdownSelect.vue';
import 'tui-image-editor/dist/tui-image-editor.css';
import 'tui-color-picker/dist/tui-color-picker.css';
const DEFAULT_ENDPOINT = 'https://www.zexitongxue.com';
const API_KEY_STORAGE = 'loomora-key';
const ENDPOINT_STORAGE = 'loomora-endpoint';
const prompt = ref(''),
  ratio = ref('16:9'),
  count = ref(1),
  reference = ref([]),
  images = ref([]),
  imagePaths = ref([]),
  gallery = ref([]),
  galleryLoading = ref(false),
  galleryColumnCount = ref(4),
  preview = ref(null),
  editorHost = ref(null),
  editorSource = ref(null),
  editorOpen = ref(false),
  editorSaving = ref(false),
  editorStatus = ref(''),
  mosaicActive = ref(false),
  mosaicSize = ref(28),
  mosaicOverlay = ref(null),
  ocrOpen = ref(false),
  ocrBusy = ref(false),
  ocrLines = ref([]),
  ocrError = ref(''),
  ocrSourceName = ref(''),
  contextMenu = ref(null),
  scrollContainer = ref(null),
  scrollThumbTop = ref(0),
  scrollThumbHeight = ref(80),
  view = ref('create'),
  settingsOpen = ref(false),
  status = ref(''),
  toast = ref(null),
  busy = ref(false),
  endpoint = ref(localStorage.getItem(ENDPOINT_STORAGE) || DEFAULT_ENDPOINT),
  model = ref('gpt-image-2'),
  resolution = ref('auto'),
  quality = ref('auto'),
  apiKey = ref(localStorage.getItem(API_KEY_STORAGE) || '');
const settingsEndpoint = ref(endpoint.value);
const settingsApiKey = ref(apiKey.value);
const apiKeyVisible = ref(false);
const modelOptions = [
  { value: 'gpt-image-2', label: 'GPT Image 2', maxCount: 14 },
  {
    value: 'gemini-3-pro-image-preview',
    label: 'Nano Banana Pro',
    maxCount: 4,
  },
  {
    value: 'gemini-3.1-flash-image-preview',
    label: 'Nano Banana 2',
    maxCount: 4,
  },
  { value: 'grok-imagine-image', label: 'Grok Imagine Image', maxCount: 1 },
  {
    value: 'grok-imagine-image-pro',
    label: 'Grok Imagine Image Pro',
    maxCount: 1,
  },
  {
    value: 'grok-imagine-image-lite',
    label: 'Grok Imagine Image Lite',
    maxCount: 1,
  },
  {
    value: 'grok-imagine-image-edit',
    label: 'Grok Imagine Image Edit',
    maxCount: 3,
  },
];
const gptRatios = ['1:1', '16:9', '9:16', '3:2', '2:3'];
const geminiRatios = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
  '21:9',
];
const grokRatios = ['1:1', '16:9', '9:16'];
const gptSizes = [
  { value: 'auto', label: '自动' },
  { value: '1024x1024', label: '1:1' },
  { value: '1536x1024', label: '3:2' },
  { value: '1024x1536', label: '2:3' },
  { value: '2048x1152', label: '16:9（2K）' },
  { value: '3840x2160', label: '16:9（4K）' },
  { value: '2160x3840', label: '9:16（4K）' },
];
const modelAliases = {
  'dall-e': 'gpt-image-2',
  'dall-e-2': 'gpt-image-2',
  'dall-e-3': 'grok-imagine-image-pro',
  'nano-banana': 'gemini-3.1-flash-image-preview',
  'nano-banana2': 'gemini-3.1-flash-image-preview',
  'nano-banana-2': 'gemini-3.1-flash-image-preview',
  'nano-banana-pro': 'gemini-3-pro-image-preview',
  'grok-imagine-image-quality': 'grok-imagine-image-pro',
};
const normalizedModel = computed(() => {
  const value = model.value.trim();
  return modelAliases[value] || value;
});
const modelIsGpt = computed(() => normalizedModel.value === 'gpt-image-2');
const modelIsGemini = computed(() =>
  normalizedModel.value.startsWith('gemini-'),
);
const activeRatios = computed(() => {
  if (modelIsGpt.value) return gptRatios;
  if (modelIsGemini.value) return geminiRatios;
  return grokRatios;
});
const ratioOptions = computed(() =>
  activeRatios.value.map((value) => ({ value, label: value })),
);
const resolutionOptions = computed(() =>
  modelIsGpt.value ? gptSizes : ratioOptions.value,
);
const qualityOptions = computed(() => {
  if (modelIsGpt.value)
    return [
      { value: 'auto', label: '自动' },
      { value: 'low', label: '低' },
      { value: 'medium', label: '中' },
      { value: 'high', label: '高' },
    ];
  if (modelIsGemini.value)
    return [
      { value: '1K', label: '1K' },
      { value: '2K', label: '2K' },
      { value: '4K', label: '4K' },
    ];
  return [];
});
const maxReferences = computed(() => {
  if (modelIsGpt.value) return 14;
  if (modelIsGemini.value) return 4;
  if (normalizedModel.value === 'grok-imagine-image-edit') return 3;
  if (normalizedModel.value === 'grok-imagine-image-lite') return 0;
  if (normalizedModel.value.startsWith('grok-imagine-image')) return 1;
  return 14;
});
const maxCount = computed(
  () =>
    modelOptions.find((option) => option.value === normalizedModel.value)
      ?.maxCount || 1,
);
watch(model, () => {
  if (modelIsGpt.value) {
    ratio.value = '16:9';
    resolution.value = 'auto';
    quality.value = 'auto';
  } else if (modelIsGemini.value) {
    ratio.value = '1:1';
    resolution.value = '1:1';
    quality.value = '2K';
  } else {
    ratio.value = '1:1';
    resolution.value = '1:1';
    quality.value = 'auto';
  }
  count.value = Math.min(count.value, maxCount.value);
  if (reference.value.length > maxReferences.value) {
    status.value = `${normalizedModel.value} 最多支持 ${maxReferences.value} 张参考图`;
  }
});
watch(ratio, (value) => {
  if (!modelIsGpt.value) resolution.value = value;
});
const counter = computed(() => `${prompt.value.length}/800`);
function sortGalleryItems(items = []) {
  return [...items].sort((a, b) => {
    const dateDifference = String(b.date || '').localeCompare(
      String(a.date || ''),
    );
    const timeDifference =
      (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
    return (
      dateDifference ||
      timeDifference ||
      String(b.name).localeCompare(String(a.name))
    );
  });
}
const galleryColumns = computed(() => {
  const columns = Array.from({ length: galleryColumnCount.value }, () => []);
  gallery.value.forEach((item, index) => {
    columns[index % columns.length].push(item);
  });
  return columns;
});
let scrollResizeObserver;
let stopGenerationStatus;
let imageEditor;
let ImageEditorClass;
let paddleOcr;
let paddleOcrReady;
let ocrFetchInstalled = false;
let ocrRunId = 0;
let ocrRunning = false;
let mosaicPoints = [];
let mosaicDrawing = false;
let toastTimer;
function showToast(message, type = 'success') {
  clearTimeout(toastTimer);
  toast.value = { message, type };
  toastTimer = setTimeout(() => {
    toast.value = null;
  }, 4000);
}
function updateScrollbar() {
  const el = scrollContainer.value;
  if (!el) return;
  const trackHeight = el.clientHeight - 24;
  scrollThumbHeight.value = Math.max(
    48,
    trackHeight * (el.clientHeight / el.scrollHeight),
  );
  const maxTop = trackHeight - scrollThumbHeight.value;
  scrollThumbTop.value =
    el.scrollHeight > el.clientHeight
      ? 12 + maxTop * (el.scrollTop / (el.scrollHeight - el.clientHeight))
      : 12;
}
function updateGalleryColumnCount() {
  galleryColumnCount.value =
    window.innerWidth <= 850 ? 2 : window.innerWidth <= 1180 ? 3 : 4;
}
function startScrollDrag(event) {
  const el = scrollContainer.value;
  const startY = event.clientY;
  const startScroll = el.scrollTop;
  const available = el.clientHeight - 24 - scrollThumbHeight.value;
  const maxScroll = el.scrollHeight - el.clientHeight;
  const move = (moveEvent) => {
    el.scrollTop =
      startScroll + ((moveEvent.clientY - startY) / available) * maxScroll;
  };
  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
}
function closePreview() {
  preview.value = null;
  closeOcr();
}
function showImageMenu(event, src, filePath = '', editable = false) {
  event.preventDefault();
  contextMenu.value = {
    x: event.clientX,
    y: event.clientY,
    src,
    filePath,
    editable,
  };
}
async function deleteContextImage() {
  if (!contextMenu.value?.filePath) return;
  const { filePath } = contextMenu.value;
  contextMenu.value = null;
  try {
    const result = await window.forge.deleteImage(filePath);
    if (!result.deleted) return;
    const index = imagePaths.value.indexOf(filePath);
    if (index >= 0) {
      imagePaths.value.splice(index, 1);
      images.value.splice(index, 1);
    }
    gallery.value = gallery.value.filter((item) => item.path !== filePath);
    closePreview();
    status.value = '图片已删除';
  } catch (error) {
    status.value = error?.message || '删除图片失败';
  }
}
async function showContextImageInFolder() {
  if (!contextMenu.value?.filePath) return;
  const { filePath } = contextMenu.value;
  contextMenu.value = null;
  try {
    await window.forge.showImageInFolder(filePath);
  } catch (error) {
    status.value = error?.message || '无法打开文件所在位置';
  }
}
async function copyContextImage() {
  if (!contextMenu.value) return;
  try {
    await window.forge.copyImage(contextMenu.value.src);
    status.value = '图片已复制';
  } catch (error) {
    status.value = error?.message || '复制图片失败';
  } finally {
    contextMenu.value = null;
  }
}
async function downloadContextImage() {
  if (!contextMenu.value) return;
  const { src, filePath } = contextMenu.value;
  const name = filePath ? filePath.split(/[\\/]/).pop() : '';
  contextMenu.value = null;
  try {
    const result = await window.forge.downloadImage({ src, filePath, name });
    if (result.saved) {
      status.value = `图片已保存到 ${result.path}`;
      showToast(`下载完成：${result.path}`);
    }
  } catch (error) {
    status.value = error?.message || '图片下载失败';
    showToast(status.value, 'error');
  }
}
function previewItems() {
  return view.value === 'gallery'
    ? gallery.value.map((item) => ({
        src: item.data,
        name: item.name,
        filePath: item.path,
        editable: true,
      }))
    : images.value.map((src, index) => ({
        src,
        name: `Generated image ${index + 1}`,
        filePath: imagePaths.value[index],
      }));
}
function openPreview(item, index = 0) {
  preview.value = { items: previewItems(), index };
}
function openReferencePreview(index = 0) {
  preview.value = {
    items: reference.value.map((item) => ({
      src: item.data,
      name: item.name,
    })),
    index,
  };
}
function movePreview(step) {
  if (!preview.value?.items.length) return;
  const total = preview.value.items.length;
  preview.value.index = (preview.value.index + step + total) % total;
  closeOcr();
}

function installLocalOcrFetch() {
  if (ocrFetchInstalled) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, options) => {
    const url = new URL(
      typeof input === 'string' ? input : input.url,
      window.location.href,
    );
    if (url.hostname !== 'loomora-ocr.local') {
      return originalFetch(input, options);
    }
    const relativePath = url.pathname.replace(/^\/models\/ocr\//, '');
    const bytes = await window.forge.readOcrModel(relativePath);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': relativePath.endsWith('.json')
          ? 'application/json'
          : 'application/octet-stream',
      },
    });
  };
  ocrFetchInstalled = true;
}

async function ensureOcrReady() {
  if (paddleOcrReady) return paddleOcrReady;
  paddleOcrReady = (async () => {
    installLocalOcrFetch();
    globalThis.Module ||= {};
    paddleOcr = await import('@paddlejs-models/ocr');
    const modelRoot = 'https://loomora-ocr.local/models/ocr';
    await paddleOcr.init(
      `${modelRoot}/detection/model.json`,
      `${modelRoot}/recognition/model.json`,
    );
  })().catch((error) => {
    paddleOcrReady = undefined;
    throw error;
  });
  return paddleOcrReady;
}

function loadOcrImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法读取待识别图片'));
    image.src = src;
  });
}

async function recognizeText(source, sourceName = '图片') {
  if (!source || ocrRunning) return;
  const runId = ++ocrRunId;
  ocrRunning = true;
  ocrOpen.value = true;
  ocrBusy.value = true;
  ocrLines.value = [];
  ocrError.value = '';
  ocrSourceName.value = sourceName;
  try {
    await ensureOcrReady();
    const image = await loadOcrImage(source);
    const result = await paddleOcr.recognize(image);
    if (runId !== ocrRunId) return;
    ocrLines.value = (
      Array.isArray(result?.text) ? result.text : [result?.text]
    )
      .flat(Infinity)
      .map((line) => String(line || '').trim())
      .filter(Boolean);
  } catch (error) {
    if (runId !== ocrRunId) return;
    console.error('PaddleOCR recognition failed', error);
    ocrError.value = error?.message || '文字识别失败，请稍后重试';
  } finally {
    ocrRunning = false;
    ocrBusy.value = false;
  }
}

function recognizePreviewText() {
  if (!currentPreview.value) return;
  recognizeText(currentPreview.value.src, currentPreview.value.name);
}

function recognizeEditorText() {
  if (!imageEditor || !editorSource.value) return;
  recognizeText(
    imageEditor.toDataURL({ format: 'png' }),
    editorSource.value.name,
  );
}

function recognizeContextText() {
  if (!contextMenu.value) return;
  const { src, filePath } = contextMenu.value;
  contextMenu.value = null;
  recognizeText(src, filePath?.split(/[\\/]/).pop() || '图片');
}

async function copyOcrText() {
  const text = ocrLines.value.join('\n');
  if (!text) return;
  try {
    await window.forge.copyText(text);
    showToast('识别文字已复制');
  } catch (error) {
    showToast(error?.message || '复制文字失败', 'error');
  }
}

function closeOcr() {
  ocrRunId += 1;
  ocrOpen.value = false;
  ocrBusy.value = ocrRunning;
  ocrLines.value = [];
  ocrError.value = '';
}
const editorLocale = {
  Load: '加载',
  Download: '下载',
  Crop: '裁剪',
  Flip: '翻转',
  Rotate: '旋转',
  Draw: '绘制',
  Shape: '形状',
  Icon: '图标',
  Text: '文字',
  Mask: '蒙版',
  Filter: '滤镜',
  Undo: '撤销',
  Redo: '重做',
  Reset: '重置',
  Delete: '删除',
  'Delete-all': '全部删除',
  Apply: '应用',
  Cancel: '取消',
  Custom: '自定义',
  Square: '正方形',
  Rectangle: '矩形',
  Circle: '圆形',
  Triangle: '三角形',
  'Flip X': '水平翻转',
  'Flip Y': '垂直翻转',
  'Lock Aspect Ratio': '锁定比例',
  Width: '宽度',
  Height: '高度',
  Angle: '角度',
  Free: '自由',
  Straight: '直线',
  Arrow: '箭头',
  'Arrow-2': '箭头 2',
  'Arrow-3': '箭头 3',
  'Text size': '文字大小',
  Bold: '粗体',
  Italic: '斜体',
  Underline: '下划线',
  Stroke: '描边',
  Fill: '填充',
  Color: '颜色',
  Range: '范围',
  Grayscale: '灰度',
  Invert: '反色',
  Sepia: '棕褐色',
  Sepia2: '棕褐色 2',
  Blur: '模糊',
  Sharpen: '锐化',
  Emboss: '浮雕',
  Noise: '噪点',
  Pixelate: '像素化',
  Brightness: '亮度',
  'Color Filter': '颜色滤镜',
  'Remove White': '去除白色',
  Distance: '距离',
  Threshold: '阈值',
  Tint: '色调',
  Multiply: '正片叠底',
  Blend: '混合',
  Opacity: '不透明度',
  Left: '左对齐',
  Center: '居中对齐',
  Right: '右对齐',
  Polygon: '多边形',
  'Star-1': '星形 1',
  'Star-2': '星形 2',
  Heart: '心形',
  Bubble: '气泡',
  Location: '位置',
  'Custom icon': '自定义图标',
  'Load Mask Image': '加载蒙版图片',
};
function getEditorCanvasRect() {
  const canvas = editorHost.value?.querySelector('.lower-canvas');
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  return rect.width && rect.height ? rect : null;
}
function ensureMosaicOverlay() {
  if (mosaicOverlay.value || !editorHost.value) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'mosaic-overlay';
  canvas.addEventListener('pointerdown', startMosaicStroke);
  canvas.addEventListener('pointermove', continueMosaicStroke);
  canvas.addEventListener('pointerup', finishMosaicStroke);
  canvas.addEventListener('pointercancel', finishMosaicStroke);
  editorHost.value.appendChild(canvas);
  mosaicOverlay.value = canvas;
}
function clearMosaicOverlay() {
  const canvas = mosaicOverlay.value;
  if (!canvas) return;
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio));
  canvas.height = Math.max(
    1,
    Math.round(canvas.clientHeight * devicePixelRatio),
  );
  const context = canvas.getContext('2d');
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
}
function updateMosaicOverlay() {
  const overlay = mosaicOverlay.value;
  const host = editorHost.value;
  const rect = getEditorCanvasRect();
  if (!overlay || !host || !rect) return;
  const hostRect = host.getBoundingClientRect();
  overlay.style.left = `${rect.left - hostRect.left}px`;
  overlay.style.top = `${rect.top - hostRect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  clearMosaicOverlay();
}
function toggleMosaic() {
  mosaicActive.value = !mosaicActive.value;
  mosaicOverlay.value?.classList.toggle('active', mosaicActive.value);
  editorStatus.value = mosaicActive.value
    ? '马赛克画笔已开启，拖动图片进行涂抹'
    : '';
  nextTick(updateMosaicOverlay);
}
function drawMosaicPreview() {
  const canvas = mosaicOverlay.value;
  if (!canvas || !mosaicPoints.length) return;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  context.beginPath();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = mosaicSize.value;
  context.strokeStyle = 'rgba(166, 120, 255, 0.42)';
  context.moveTo(mosaicPoints[0].x, mosaicPoints[0].y);
  for (const point of mosaicPoints.slice(1)) context.lineTo(point.x, point.y);
  context.stroke();
  const last = mosaicPoints[mosaicPoints.length - 1];
  context.beginPath();
  context.arc(last.x, last.y, mosaicSize.value / 2, 0, Math.PI * 2);
  context.fillStyle = 'rgba(181, 143, 255, 0.25)';
  context.fill();
}
function addMosaicPoint(event) {
  const rect = mosaicOverlay.value?.getBoundingClientRect();
  if (!rect) return;
  mosaicPoints.push({
    x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
    y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
  });
  drawMosaicPreview();
}
function startMosaicStroke(event) {
  if (!mosaicActive.value || editorSaving.value) return;
  mosaicDrawing = true;
  mosaicPoints = [];
  mosaicOverlay.value?.setPointerCapture?.(event.pointerId);
  addMosaicPoint(event);
}
function continueMosaicStroke(event) {
  if (!mosaicDrawing) return;
  addMosaicPoint(event);
}
function interpolateMosaicPoints(points) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const previous = points[i - 1];
    if (!previous) {
      result.push(current);
      continue;
    }
    const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
    const steps = Math.max(
      1,
      Math.ceil(distance / Math.max(4, mosaicSize.value / 3)),
    );
    for (let step = 1; step <= steps; step++) {
      const ratio = step / steps;
      result.push({
        x: previous.x + (current.x - previous.x) * ratio,
        y: previous.y + (current.y - previous.y) * ratio,
      });
    }
  }
  return result;
}
async function applyMosaicStroke() {
  const rect = getEditorCanvasRect();
  if (!rect || !mosaicPoints.length || !imageEditor) return;
  const source = new Image();
  source.src = imageEditor.toDataURL({ format: 'png' });
  await new Promise((resolve, reject) => {
    source.onload = resolve;
    source.onerror = reject;
  });
  const canvas = document.createElement('canvas');
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const context = canvas.getContext('2d');
  context.drawImage(source, 0, 0);
  const original = context.getImageData(0, 0, canvas.width, canvas.height);
  const output = context.createImageData(original);
  output.data.set(original.data);
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const radius = Math.max(8, (mosaicSize.value * (scaleX + scaleY)) / 2);
  const block = Math.max(6, Math.round(radius / 2.2));
  for (const point of interpolateMosaicPoints(mosaicPoints)) {
    const centerX = Math.round(point.x * scaleX);
    const centerY = Math.round(point.y * scaleY);
    const left = Math.max(0, Math.floor(centerX - radius));
    const right = Math.min(canvas.width - 1, Math.ceil(centerX + radius));
    const top = Math.max(0, Math.floor(centerY - radius));
    const bottom = Math.min(canvas.height - 1, Math.ceil(centerY + radius));
    for (let y = top; y <= bottom; y += block) {
      for (let x = left; x <= right; x += block) {
        const sampleX = Math.min(canvas.width - 1, x + Math.floor(block / 2));
        const sampleY = Math.min(canvas.height - 1, y + Math.floor(block / 2));
        if (Math.hypot(sampleX - centerX, sampleY - centerY) > radius) continue;
        const sample = (sampleY * canvas.width + sampleX) * 4;
        for (let yy = y; yy < Math.min(y + block, canvas.height); yy++) {
          for (let xx = x; xx < Math.min(x + block, canvas.width); xx++) {
            const target = (yy * canvas.width + xx) * 4;
            output.data[target] = original.data[sample];
            output.data[target + 1] = original.data[sample + 1];
            output.data[target + 2] = original.data[sample + 2];
            output.data[target + 3] = original.data[sample + 3];
          }
        }
      }
    }
  }
  context.putImageData(output, 0, 0);
  await imageEditor.loadImageFromURL(
    canvas.toDataURL('image/png'),
    editorSource.value.name,
  );
  mosaicPoints = [];
  clearMosaicOverlay();
  updateMosaicOverlay();
}
async function finishMosaicStroke(event) {
  if (!mosaicDrawing) return;
  mosaicDrawing = false;
  mosaicOverlay.value?.releasePointerCapture?.(event.pointerId);
  try {
    await applyMosaicStroke();
  } catch (error) {
    editorStatus.value = error?.message || '马赛克处理失败';
    mosaicPoints = [];
    clearMosaicOverlay();
  }
}
async function openImageEditor(source = currentPreview.value) {
  if (!source?.editable || !source.filePath) return;
  editorSource.value = { ...source };
  editorStatus.value = '正在加载编辑器...';
  closePreview();
  editorOpen.value = true;
  await nextTick();
  try {
    if (!ImageEditorClass) {
      const module = await import('tui-image-editor');
      ImageEditorClass = module.default || module;
    }
    imageEditor = new ImageEditorClass(editorHost.value, {
      includeUI: {
        loadImage: {
          path: editorSource.value.src,
          name: editorSource.value.name,
        },
        locale: editorLocale,
        menu: [
          'crop',
          'flip',
          'rotate',
          'draw',
          'shape',
          'icon',
          'text',
          'filter',
        ],
        initMenu: 'filter',
        uiSize: { width: '100%', height: '100%' },
        menuBarPosition: 'bottom',
      },
      cssMaxWidth: Math.max(640, window.innerWidth - 100),
      cssMaxHeight: Math.max(400, window.innerHeight - 270),
      usageStatistics: false,
    });
    editorStatus.value = '';
    await nextTick();
    ensureMosaicOverlay();
    updateMosaicOverlay();
  } catch (error) {
    status.value = error?.message || '图片编辑器加载失败';
    closeImageEditor(true);
  }
}
function editContextImage() {
  if (!contextMenu.value?.editable) return;
  const source = {
    src: contextMenu.value.src,
    name: contextMenu.value.filePath.split(/[\\/]/).pop(),
    filePath: contextMenu.value.filePath,
    editable: true,
  };
  contextMenu.value = null;
  openImageEditor(source);
}
function closeImageEditor(force = false) {
  if (editorSaving.value && !force) return;
  imageEditor?.destroy();
  imageEditor = undefined;
  mosaicActive.value = false;
  mosaicOverlay.value = null;
  mosaicPoints = [];
  mosaicDrawing = false;
  editorOpen.value = false;
  editorSource.value = null;
  editorStatus.value = '';
  closeOcr();
}
async function saveEditedImage() {
  if (!imageEditor || !editorSource.value?.filePath) return;
  editorSaving.value = true;
  editorStatus.value = '正在保存新图片...';
  try {
    const result = await window.forge.saveEditedImage({
      sourcePath: editorSource.value.filePath,
      dataUrl: imageEditor.toDataURL({ format: 'png' }),
    });
    if (!result.saved) {
      editorStatus.value = '';
      return;
    }
    if (result.item) {
      gallery.value = sortGalleryItems([result.item, ...gallery.value]);
    }
    status.value = `图片已保存到 ${result.path}`;
    showToast(`保存完成：${result.path}`);
    closeImageEditor(true);
  } catch (error) {
    editorStatus.value = error?.message || '保存编辑图片失败';
  } finally {
    editorSaving.value = false;
  }
}
const currentPreview = computed(
  () => preview.value?.items[preview.value.index],
);
function onKeydown(event) {
  if (event.key === 'Escape') {
    if (settingsOpen.value) {
      closeSettings();
      return;
    }
    if (ocrOpen.value) {
      closeOcr();
      return;
    }
    if (editorOpen.value) {
      closeImageEditor();
      return;
    }
    contextMenu.value = null;
    closePreview();
  }
  if (preview.value && event.key === 'ArrowLeft') movePreview(-1);
  if (preview.value && event.key === 'ArrowRight') movePreview(1);
}
function readPastedImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('无法读取剪贴板图片'));
    reader.readAsDataURL(file);
  });
}
async function onPaste(event) {
  if (view.value !== 'create' || editorOpen.value || settingsOpen.value) return;
  const imageItem = Array.from(event.clipboardData?.items || []).find(
    (item) => item.kind === 'file' && item.type.startsWith('image/'),
  );
  if (!imageItem) return;
  event.preventDefault();
  if (reference.value.length >= maxReferences.value) {
    status.value = `${normalizedModel.value} 最多添加 ${maxReferences.value} 张参考图`;
    return;
  }
  const file = imageItem.getAsFile();
  if (!file) return;
  try {
    const data = await readPastedImage(file);
    reference.value.push({
      name: file.name || `粘贴参考图-${Date.now()}.png`,
      data,
    });
    status.value = '已粘贴参考图';
    showToast('参考图已添加');
  } catch (error) {
    status.value = error?.message || '粘贴参考图失败';
    showToast(status.value, 'error');
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('paste', onPaste);
  window.addEventListener('resize', updateScrollbar);
  window.addEventListener('resize', updateMosaicOverlay);
  window.addEventListener('resize', updateGalleryColumnCount);
  updateGalleryColumnCount();
  scrollResizeObserver = new ResizeObserver(updateScrollbar);
  scrollResizeObserver.observe(scrollContainer.value);
  scrollResizeObserver.observe(scrollContainer.value.querySelector('main'));
  stopGenerationStatus = window.forge?.onGenerationStatus?.((message) => {
    status.value = message;
  });
  nextTick(updateScrollbar);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('paste', onPaste);
  window.removeEventListener('resize', updateScrollbar);
  window.removeEventListener('resize', updateMosaicOverlay);
  window.removeEventListener('resize', updateGalleryColumnCount);
  scrollResizeObserver?.disconnect();
  stopGenerationStatus?.();
  imageEditor?.destroy();
  clearTimeout(toastTimer);
});
async function openGallery() {
  view.value = 'gallery';
  if (galleryLoading.value) return;
  galleryLoading.value = true;
  await nextTick();
  try {
    gallery.value = sortGalleryItems(await window.forge.listGallery());
  } catch (error) {
    gallery.value = [];
    status.value = error?.message || '作品库加载失败';
    showToast(status.value, 'error');
  } finally {
    galleryLoading.value = false;
    nextTick(updateScrollbar);
  }
}
async function pick() {
  if (reference.value.length >= maxReferences.value) {
    status.value = `${normalizedModel.value} 最多添加 ${maxReferences.value} 张参考图`;
    return;
  }
  const r = await window.forge.pickImage();
  if (r) reference.value.push(r);
}
function removeRef(i) {
  reference.value.splice(i, 1);
}
function openSettings() {
  settingsEndpoint.value = endpoint.value;
  settingsApiKey.value = apiKey.value;
  apiKeyVisible.value = false;
  settingsOpen.value = true;
}
function closeSettings() {
  settingsOpen.value = false;
}
function save() {
  endpoint.value = settingsEndpoint.value.trim() || DEFAULT_ENDPOINT;
  apiKey.value = settingsApiKey.value.trim();
  localStorage.setItem(API_KEY_STORAGE, apiKey.value);
  localStorage.setItem(ENDPOINT_STORAGE, endpoint.value);
  closeSettings();
  status.value = '配置已保存';
  showToast('配置已保存');
}
async function generate() {
  if (!prompt.value.trim()) {
    status.value = '请输入提示词';
    return;
  }
  if (!apiKey.value.trim()) {
    status.value = '请先填写 API Key';
    return;
  }
  if (reference.value.length > maxReferences.value) {
    status.value = `${normalizedModel.value} 最多支持 ${maxReferences.value} 张参考图`;
    return;
  }
  if (!window.forge?.generate) {
    status.value = '应用通信服务不可用，请重启 Loomora';
    return;
  }
  busy.value = true;
  const total = Math.min(maxCount.value, Math.max(1, Number(count.value) || 1));
  status.value = `正在生成 ${total} 张图片...`;
  const request = {
    endpoint: endpoint.value,
    apiKey: apiKey.value,
    model: model.value,
    prompt: prompt.value,
    aspect: ratio.value,
    size: resolution.value,
    quality: quality.value,
    count: total,
    reference: reference.value.map(({ name, data }) => ({ name, data })),
  };
  try {
    const result = await window.forge.generate(request);
    images.value = result.images || [];
    imagePaths.value = result.localPaths || [];
    if (!result.ok || result.failedCount) {
      status.value = result.error || '图片生成失败';
      return;
    }
    const folder = result.folder;
    status.value = folder ? `生成完成，作品已保存到 ${folder}` : '图片生成完成';
  } catch (error) {
    status.value = error?.message || '图片生成请求发送失败';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div
    ref="scrollContainer"
    class="app-shell"
    @scroll="updateScrollbar"
    @click="contextMenu = null"
  >
    <div class="window-titlebar" aria-hidden="true"></div>
    <div class="aurora a1"></div>
    <div class="aurora a2"></div>
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"></span><b>Loomora</b>
      </div>
      <nav>
        <a :class="{ active: view === 'create' }" @click="view = 'create'"
          >AI 创作</a
        ><a :class="{ active: view === 'gallery' }" @click="openGallery"
          >作品库</a
        ><a>灵感广场</a>
      </nav>
      <button
        class="config-btn"
        title="打开接口设置"
        aria-label="打开接口设置"
        @click="openSettings"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2.12 2.12-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V20h-3v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06-2.12-2.12.06-.06A1.65 1.65 0 0 0 7.1 15a1.65 1.65 0 0 0-1.51-1H5.5v-3h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06 2.12-2.12.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V4.7h3v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06 2.12 2.12-.06.06a1.65 1.65 0 0 0-.33 1.82v.08A1.65 1.65 0 0 0 20.91 11H21v3h-.09A1.65 1.65 0 0 0 19.4 15Z"
          />
        </svg>
      </button>
    </header>
    <main>
      <section v-if="view === 'create'" class="intro">
        <div class="eyebrow">✦ Loomora · 织光成画 ✦</div>
        <h1>把灵感变成画面</h1>
        <p>loom light into images.</p>
        <small>灵感落笔处，光芒渐次生</small>
      </section>
      <section v-if="view === 'create'" class="create-card">
        <div class="card-title">
          <div>
            <span>✦</span>
            <h2>快速创作</h2>
          </div>
          <span class="status">{{ status || '准备就绪' }}</span>
        </div>
        <div class="prompt-box">
          <textarea
            v-model="prompt"
            maxlength="800"
            placeholder="描述你的创意画面，例如：金色晨曦洒在云海之上，未来城市与自然共生"
          ></textarea>
          <div class="prompt-tools">
            <button :disabled="maxReferences === 0" @click="pick">
              <svg
                class="reference-upload-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <rect x="3.5" y="4" width="14" height="16" rx="2" />
                <circle cx="8" cy="9" r="1.5" />
                <path d="m5.5 17 3.5-3.5 2.5 2.5 2-2 2.5 2.5" />
                <path d="M19 8v7M15.5 11.5h7" />
              </svg>
              添加参考图（{{ reference.length }}/{{ maxReferences }}）</button
            ><span>{{ counter }}</span>
          </div>
        </div>
        <div v-if="reference.length" class="reference-list">
          <div
            v-for="(item, i) in reference"
            :key="item.name + i"
            class="reference"
          >
            <img
              :src="item.data"
              :alt="item.name"
              title="点击查看大图"
              @click="openReferencePreview(i)"
            /><span>{{ item.name }}</span
            ><button @click="removeRef(i)">×</button>
          </div>
        </div>
        <div class="control-row">
          <label
            ><span>模型选择</span>
            <DropdownSelect
              v-model="model"
              :options="modelOptions"
              aria-label="选择图片生成模型" /></label
          ><label
            ><span>画面比例</span>
            <DropdownSelect
              v-model="ratio"
              :options="ratioOptions"
              aria-label="选择画面比例" /></label
          ><label
            ><span>分辨率</span>
            <DropdownSelect
              v-model="resolution"
              :options="resolutionOptions"
              aria-label="选择分辨率" /></label
          ><label v-if="modelIsGpt || modelIsGemini"
            ><span>质量</span>
            <DropdownSelect
              v-model="quality"
              :options="qualityOptions"
              aria-label="选择图片质量" /></label
          ><label
            ><span>批量抽卡（最多 {{ maxCount }} 张）</span>
            <div class="stepper">
              <button @click="count = Math.max(1, count - 1)">−</button
              ><b>{{ count }}</b
              ><button @click="count = Math.min(maxCount, count + 1)">
                ＋
              </button>
            </div></label
          ><button class="generate" :disabled="busy" @click="generate">
            ✦ {{ busy ? '生成中…' : '生成' }}
          </button>
        </div>
      </section>
      <section class="works" :class="{ 'library-view': view === 'gallery' }">
        <div class="works-head">
          <div>
            <span class="section-kicker">灵感作品</span>
            <h2>
              {{
                view === 'gallery'
                  ? '作品库'
                  : images.length
                    ? '本次创作'
                    : '等待灵感降临'
              }}
            </h2>
          </div>
          <span>{{
            view === 'gallery'
              ? galleryLoading
                ? '正在读取本地作品...'
                : `${gallery.length} 张本地作品`
              : images.length
                ? `${images.length} 张作品`
                : '生成的图片将在这里展示'
          }}</span>
        </div>
        <div
          v-if="view === 'create'"
          class="gallery"
          :class="{ empty: !images.length }"
        >
          <img
            v-for="src in images"
            :key="src"
            :src="src"
            @click="openPreview(src, images.indexOf(src))"
            @contextmenu="
              showImageMenu($event, src, imagePaths[images.indexOf(src)])
            "
          />
          <div v-if="!images.length" class="empty-state">
            <span class="create-empty-icon">✧</span
            ><b>织一束光，生成第一幅作品</b
            ><small>输入提示词，也可以添加一张参考图</small>
          </div>
        </div>
        <div
          v-else
          class="gallery library-gallery"
          :style="{ '--library-column-count': galleryColumnCount }"
          :class="{
            empty: galleryLoading || !gallery.length,
            loading: galleryLoading,
          }"
        >
          <div
            v-for="(column, columnIndex) in galleryLoading || !gallery.length
              ? []
              : galleryColumns"
            :key="columnIndex"
            class="library-gallery-column"
          >
            <article
              v-for="item in column"
              :key="item.path"
              class="gallery-card"
            >
              <img
                :src="item.data"
                :alt="item.name"
                @click="openPreview(item, gallery.indexOf(item))"
                @contextmenu="showImageMenu($event, item.data, item.path, true)"
              />
              <div class="gallery-card-meta">
                <b>{{ item.name }}</b
                ><small>{{ item.date }}</small>
              </div>
            </article>
          </div>
          <div v-if="galleryLoading" class="gallery-loading" role="status">
            <span class="gallery-loading-spinner"></span>
            <b>正在加载作品库</b>
            <small>正在读取本地图片，请稍候</small>
          </div>
          <div v-else-if="!gallery.length" class="empty-state">
            <span>✧</span><b>作品库还是空的</b
            ><small>生成的图片会自动出现在这里</small>
          </div>
        </div>
      </section>
    </main>
    <div
      v-if="preview"
      class="lightbox"
      role="dialog"
      aria-modal="true"
      @click.self="closePreview"
    >
      <div class="lightbox-actions">
        <button
          class="lightbox-ocr"
          :disabled="ocrBusy"
          title="识别图片中的文字"
          @click="recognizePreviewText"
        >
          {{ ocrBusy ? '识别中...' : '识别文字' }}
        </button>
        <button
          v-if="currentPreview.editable && currentPreview.filePath"
          class="lightbox-edit"
          title="编辑图片"
          @click="openImageEditor()"
        >
          编辑
        </button>
      </div>
      <button
        v-if="preview && preview.items.length > 1"
        class="lightbox-nav lightbox-prev"
        title="Previous image"
        @click="movePreview(-1)"
      >
        ‹
      </button>
      <button
        v-if="preview && preview.items.length > 1"
        class="lightbox-nav lightbox-next"
        title="Next image"
        @click="movePreview(1)"
      >
        ›
      </button>
      <button
        class="lightbox-close"
        title="Close preview"
        aria-label="Close preview"
        @click="closePreview"
      >
        ×
      </button>
      <figure>
        <img
          :src="currentPreview.src"
          :alt="currentPreview.name"
          @contextmenu="
            showImageMenu(
              $event,
              currentPreview.src,
              currentPreview.filePath,
              currentPreview.editable,
            )
          "
        />
        <figcaption>
          {{ currentPreview.name }} · {{ preview.index + 1 }} /
          {{ preview.items.length }}
        </figcaption>
      </figure>
    </div>
    <div
      v-if="editorOpen"
      class="image-editor-modal"
      role="dialog"
      aria-modal="true"
      aria-label="图片编辑器"
    >
      <header class="image-editor-toolbar">
        <div>
          <b>编辑图片</b>
          <span>{{ editorSource.name }}</span>
        </div>
        <span class="image-editor-status">{{ editorStatus }}</span>
        <div class="image-editor-actions">
          <label class="mosaic-size-control" title="调整马赛克笔刷大小">
            <span>笔刷</span>
            <input
              v-model.number="mosaicSize"
              type="range"
              min="12"
              max="72"
              step="2"
            />
            <b>{{ mosaicSize }}px</b>
          </label>
          <button
            class="mosaic-toggle"
            :class="{ active: mosaicActive }"
            :disabled="editorSaving"
            title="拖动涂抹局部区域"
            @click="toggleMosaic"
          >
            {{ mosaicActive ? '关闭马赛克' : '马赛克' }}
          </button>
          <button
            class="ocr-editor-button"
            :disabled="editorSaving || ocrBusy"
            title="识别当前画面中的文字"
            @click="recognizeEditorText"
          >
            {{ ocrBusy ? '识别中...' : '文字识别' }}
          </button>
          <button :disabled="editorSaving" @click="closeImageEditor()">
            取消
          </button>
          <button
            class="save-edited-image"
            :disabled="editorSaving"
            @click="saveEditedImage"
          >
            {{ editorSaving ? '保存中...' : '另存为新图' }}
          </button>
        </div>
      </header>
      <div ref="editorHost" class="image-editor-host"></div>
    </div>
    <div
      v-if="contextMenu"
      class="image-context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <button @click="copyContextImage"><span>▣</span>复制</button>
      <button @click="downloadContextImage"><span>↓</span>下载</button>
      <button @click="recognizeContextText"><span>文</span>识别文字</button>
      <button v-if="contextMenu.editable" @click="editContextImage">
        <span>✎</span>编辑
      </button>
      <button v-if="contextMenu.filePath" @click="showContextImageInFolder">
        <span>↗</span>打开文件所在位置
      </button>
      <button
        v-if="contextMenu.filePath"
        class="danger"
        @click="deleteContextImage"
      >
        <span>×</span>删除
      </button>
    </div>
    <Transition name="ocr-drawer">
      <div v-if="ocrOpen" class="ocr-drawer-layer" @click.self="closeOcr">
        <aside
          class="ocr-result-panel"
          role="dialog"
          aria-modal="true"
          aria-label="文字识别结果"
          @click.stop
        >
          <header>
            <div>
              <b>文字识别</b>
              <span>{{ ocrSourceName }}</span>
            </div>
            <button
              title="关闭识别结果"
              aria-label="关闭识别结果"
              @click="closeOcr"
            >
              ×
            </button>
          </header>
          <div class="ocr-result-body">
            <div v-if="ocrBusy" class="ocr-result-state" role="status">
              <span class="ocr-spinner"></span>
              <b>正在识别文字</b>
              <small>首次使用需要加载本地识别模型</small>
            </div>
            <div v-else-if="ocrError" class="ocr-result-state ocr-error">
              <span>!</span>
              <b>识别失败</b>
              <small>{{ ocrError }}</small>
            </div>
            <div v-else-if="!ocrLines.length" class="ocr-result-state">
              <span>文</span>
              <b>未识别到文字</b>
              <small>可尝试使用更清晰、文字方向更端正的图片</small>
            </div>
            <div v-else class="ocr-lines">
              <p v-for="(line, index) in ocrLines" :key="`${index}-${line}`">
                {{ line }}
              </p>
            </div>
          </div>
          <footer>
            <span v-if="ocrLines.length"
              >已识别 {{ ocrLines.length }} 段文字</span
            >
            <span v-else></span>
            <button :disabled="!ocrLines.length" @click="copyOcrText">
              复制全部
            </button>
          </footer>
        </aside>
      </div>
    </Transition>
    <Transition name="settings-modal">
      <div
        v-if="settingsOpen"
        class="settings-modal-layer"
        @click.self="closeSettings"
      >
        <section
          class="settings-modal"
          role="dialog"
          aria-modal="true"
          aria-label="接口设置"
          @click.stop
        >
          <header>
            <div>
              <b>接口设置</b>
              <span>配置图片生成服务</span>
            </div>
            <button
              title="关闭设置"
              aria-label="关闭设置"
              @click="closeSettings"
            >
              ×
            </button>
          </header>
          <div class="settings-modal-body">
            <label>
              <span>网站地址</span>
              <input v-model="settingsEndpoint" placeholder="API 地址" />
            </label>
            <label>
              <span>API Key</span>
              <div class="api-key-input">
                <input
                  v-model="settingsApiKey"
                  :type="apiKeyVisible ? 'text' : 'password'"
                  placeholder="请输入 API Key"
                />
                <button
                  type="button"
                  :title="apiKeyVisible ? '隐藏 API Key' : '显示 API Key'"
                  :aria-label="apiKeyVisible ? '隐藏 API Key' : '显示 API Key'"
                  @click="apiKeyVisible = !apiKeyVisible"
                >
                  <svg
                    v-if="apiKeyVisible"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M3 3l18 18" />
                    <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
                    <path
                      d="M9.9 4.2A10.7 10.7 0 0 1 12 4c5.2 0 9 5.3 9 8a9.6 9.6 0 0 1-2 3.5"
                    />
                    <path
                      d="M6.6 6.6C4.3 8.1 3 10.4 3 12c0 2.7 3.8 8 9 8 1.3 0 2.5-.3 3.6-.8"
                    />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M3 12c0-2.7 3.8-8 9-8s9 5.3 9 8-3.8 8-9 8-9-5.3-9-8Z"
                    />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
            </label>
          </div>
          <footer>
            <button class="settings-cancel" @click="closeSettings">取消</button>
            <button class="settings-save" @click="save">保存配置</button>
          </footer>
        </section>
      </div>
    </Transition>
    <Transition name="toast">
      <div
        v-if="toast"
        class="app-toast"
        :class="`app-toast-${toast.type}`"
        role="status"
      >
        <span>{{ toast.type === 'success' ? '✓' : '!' }}</span>
        <p>{{ toast.message }}</p>
        <button title="关闭提示" aria-label="关闭提示" @click="toast = null">
          ×
        </button>
      </div>
    </Transition>
    <div class="custom-scrollbar" aria-hidden="true">
      <div
        class="custom-scrollbar-thumb"
        :style="{
          height: `${scrollThumbHeight}px`,
          top: `${scrollThumbTop}px`,
        }"
        @pointerdown.prevent="startScrollDrag"
      ></div>
    </div>
  </div>
</template>
