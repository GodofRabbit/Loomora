import { ref } from 'vue';

export function useOcr(showToast) {
  const open = ref(false);
  const busy = ref(false);
  const lines = ref([]);
  const error = ref('');
  const sourceName = ref('');
  let paddleOcr;
  let paddleOcrReady;
  let fetchInstalled = false;
  let runId = 0;
  let running = false;

  function installLocalModelFetch() {
    if (fetchInstalled) return;
    const originalFetch = window.fetch.bind(window);
    // PaddleOCR expects URLs, while Electron serves model bytes over IPC.
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
    fetchInstalled = true;
  }

  async function ensureReady() {
    if (paddleOcrReady) return paddleOcrReady;
    paddleOcrReady = (async () => {
      installLocalModelFetch();
      globalThis.Module ||= {};
      paddleOcr = await import('@paddlejs-models/ocr');
      const modelRoot = 'https://loomora-ocr.local/models/ocr';
      await paddleOcr.init(
        `${modelRoot}/detection/model.json`,
        `${modelRoot}/recognition/model.json`,
      );
    })().catch((loadError) => {
      paddleOcrReady = undefined;
      throw loadError;
    });
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

  async function recognize(source, name = '图片') {
    if (!source || running) return;
    const currentRun = ++runId;
    running = true;
    open.value = true;
    busy.value = true;
    lines.value = [];
    error.value = '';
    sourceName.value = name;
    try {
      await ensureReady();
      const result = await paddleOcr.recognize(await loadImage(source));
      if (currentRun !== runId) return;
      lines.value = (Array.isArray(result?.text) ? result.text : [result?.text])
        .flat(Infinity)
        .map((line) => String(line || '').trim())
        .filter(Boolean);
    } catch (recognitionError) {
      if (currentRun !== runId) return;
      console.error('PaddleOCR recognition failed', recognitionError);
      error.value = recognitionError?.message || '文字识别失败，请稍后重试';
    } finally {
      running = false;
      busy.value = false;
    }
  }

  async function copyText() {
    const text = lines.value.join('\n');
    if (!text) return;
    try {
      await window.forge.copyText(text);
      showToast('识别文字已复制');
    } catch (copyError) {
      showToast(copyError?.message || '复制文字失败', 'error');
    }
  }

  function close() {
    runId += 1;
    open.value = false;
    busy.value = running;
    lines.value = [];
    error.value = '';
  }

  return { open, busy, lines, error, sourceName, recognize, copyText, close };
}
