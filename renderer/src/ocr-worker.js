let paddleOcr;
let paddleOcrReady;
let fetchInstalled = false;

function installLocalModelFetch() {
  if (fetchInstalled) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, options) => {
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(rawUrl, window.location.href);
    if (url.hostname !== 'loomora-ocr.local') {
      return originalFetch(input, options);
    }
    const relativePath = url.pathname.replace(/^\/models\/ocr\//, '');
    const bytes = await window.ocrWorker.readModel(relativePath);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': relativePath.endsWith('.json')
          ? 'application/json'
          : 'application/octet-stream',
      },
    });
  };
  fetchInstalled = true;
}

function assertRuntime() {
  if (typeof WebAssembly !== 'object') {
    throw new Error('当前系统未启用 WebAssembly，无法运行本地文字识别');
  }
  const canvas = document.createElement('canvas');
  const context =
    canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) ||
    canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false });
  if (!context) {
    throw new Error(
      '当前设备未提供可用的 WebGL 图形环境，请重启应用；若问题持续，请更新系统后再试',
    );
  }
}

async function ensureReady() {
  if (paddleOcrReady) return paddleOcrReady;
  paddleOcrReady = (async () => {
    assertRuntime();
    installLocalModelFetch();
    globalThis.Module ||= {};
    paddleOcr = await import('@paddlejs-models/ocr');
    const modelRoot = 'https://loomora-ocr.local/models/ocr';
    await paddleOcr.init(
      `${modelRoot}/detection/model.json`,
      `${modelRoot}/recognition/model.json`,
    );
  })();
  return paddleOcrReady;
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法读取待识别图片'));
    image.src = source;
  });
}

function normalizeLines(result) {
  return (Array.isArray(result?.text) ? result.text : [result?.text])
    .flat(Infinity)
    .map((line) => String(line || '').trim())
    .filter(Boolean);
}

window.ocrWorker.onRecognize(async ({ id, source }) => {
  try {
    await ensureReady();
    const result = await paddleOcr.recognize(await loadImage(source));
    window.ocrWorker.sendResult({ id, lines: normalizeLines(result) });
  } catch (error) {
    window.ocrWorker.sendResult({
      id,
      error: String(error?.message || error || '文字识别失败'),
    });
  }
});

window.ocrWorker.ready();
