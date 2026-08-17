import { ref } from 'vue';
import { formatUserMessage } from '../utils/userMessages';

export function useOcr(showToast) {
  const open = ref(false);
  const busy = ref(false);
  const lines = ref([]);
  const error = ref('');
  const sourceName = ref('');
  let runId = 0;

  function resetState() {
    runId += 1;
    open.value = false;
    busy.value = false;
    lines.value = [];
    error.value = '';
    sourceName.value = '';
  }

  async function resolveImageSource(source) {
    if (typeof source !== 'string' || !source.startsWith('loomora-gallery:')) {
      return source;
    }
    try {
      const filePath = new URL(source).searchParams.get('path');
      if (!filePath) throw new Error('图片路径无效');
      return await window.forge.readGalleryImage(filePath);
    } catch {
      throw new Error('无法读取作品库中的待识别图片');
    }
  }

  function describeOcrError(value) {
    const message = String(value?.message || value || '');
    if (/webgl|gl_|graphics|texture|gpu/i.test(message)) {
      return '图形加速初始化失败，请重启应用；若问题持续，请更新系统后再试';
    }
    if (/ocr model|model|chunk_|read-ocr-model/i.test(message)) {
      return '本地识别模型读取失败，请重新安装应用后再试';
    }
    if (/memory|allocation|out of bounds/i.test(message)) {
      return '图片过大或可用内存不足，请缩小图片后重试';
    }
    return formatUserMessage(value, '文字识别失败，请稍后重试');
  }

  async function recognize(source, name = '图片') {
    if (!source) return;
    const currentRun = ++runId;
    open.value = true;
    busy.value = true;
    lines.value = [];
    error.value = '';
    sourceName.value = name;
    try {
      const safeSource = await resolveImageSource(source);
      if (currentRun !== runId) return;
      const result = await window.forge.recognizeText({ source: safeSource });
      if (currentRun !== runId) return;
      lines.value = Array.isArray(result?.lines) ? result.lines : [];
    } catch (recognitionError) {
      if (currentRun !== runId) return;
      console.error('PaddleOCR 文字识别失败', recognitionError);
      error.value = describeOcrError(recognitionError);
    } finally {
      if (currentRun === runId) busy.value = false;
    }
  }

  async function copyText() {
    const text = lines.value.join('\n');
    if (!text) return;
    try {
      await window.forge.copyText(text);
      showToast('识别文字已复制');
    } catch (copyError) {
      showToast(
        formatUserMessage(copyError, '复制文字失败，请稍后重试'),
        'error',
      );
    }
  }

  function cancel() {
    const wasBusy = busy.value;
    resetState();
    window.forge.cancelOcr().catch(() => {});
    if (wasBusy) showToast('已取消本次文字识别');
  }

  function close() {
    if (busy.value) {
      cancel();
      return;
    }
    // Keep the initialized local model alive so the next recognition starts immediately.
    resetState();
  }

  return {
    open,
    busy,
    lines,
    error,
    sourceName,
    recognize,
    copyText,
    cancel,
    close,
  };
}
