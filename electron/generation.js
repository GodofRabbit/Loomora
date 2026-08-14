const { ipcMain } = require('electron');
const { saveGeneratedImages } = require('./gallery');

const DEFAULT_ENDPOINT = 'https://www.zexitongxue.com';
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
const MODEL_GENERATION_LIMITS = {
  'gpt-image-2': 14,
  'gemini-3-pro-image-preview': 4,
  'gemini-3.1-flash-image-preview': 4,
  'grok-imagine-image': 1,
  'grok-imagine-image-pro': 1,
  'grok-imagine-image-lite': 1,
  'grok-imagine-image-edit': 3,
};

const normalizeModel = (model) => MODEL_ALIASES[model] || model;
const requestHeaders = (key, json = false) => ({
  Authorization: `Bearer ${key}`,
  ...(json ? { 'Content-Type': 'application/json' } : {}),
});
const taskIdOf = (data) =>
  data?.task_id || data?.id || data?.data?.task_id || data?.data?.id;
const statusOf = (data) =>
  String(
    data?.status || data?.data?.status || data?.task?.status || '',
  ).toLowerCase();

function imagesOf(data) {
  if (data?.result_url) return [{ url: data.result_url }];
  if (Array.isArray(data?.data)) return data.data;
  if (data?.data && typeof data.data === 'object') {
    const nested = imagesOf(data.data);
    if (nested.length) return nested;
  }
  return ['url', 'image_url', 'b64_json', 'base64'].some((key) => data?.[key])
    ? [data]
    : [];
}

function generationLimit(model) {
  return MODEL_GENERATION_LIMITS[model] || 1;
}

function referenceLimit(model) {
  if (model === 'gpt-image-2') return 14;
  if (model.startsWith('gemini-')) return 4;
  if (model === 'grok-imagine-image-edit') return 3;
  if (model === 'grok-imagine-image-lite') return 0;
  if (model.startsWith('grok-imagine-image')) return 1;
  return 14;
}

function generationBody(payload, model) {
  const isGptImage = model === 'gpt-image-2';
  const isGemini = model.startsWith('gemini-');
  const size = isGptImage
    ? GPT_IMAGE_SIZE_VALUES.has(payload.size)
      ? payload.size
      : GPT_IMAGE_SIZES[payload.aspect] || '1024x1024'
    : (payload.size?.includes(':') ? payload.size : payload.aspect) || '1:1';
  const gptQuality = ['low', 'medium', 'high', 'auto'].includes(payload.quality)
    ? payload.quality
    : 'auto';
  const geminiQuality = ['1K', '2K', '4K'].includes(payload.quality)
    ? payload.quality
    : '2K';
  const body = {
    model,
    prompt: payload.prompt.trim(),
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
      google: { image_config: { aspect_ratio: size, image_size: '4K' } },
    };
  }
  const references = Array.isArray(payload.reference) ? payload.reference : [];
  if (references.length) {
    const imageUrls = references.map((item) => item.data);
    body.image_url = imageUrls.length === 1 ? imageUrls[0] : imageUrls;
  }
  return body;
}

async function responseJson(response, errorPrefix) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `${errorPrefix}返回非 JSON (${response.status}): ${text.slice(0, 180)}`,
    );
  }
}

async function generateOne(payload, batchIndex, event) {
  const report = (message) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('generation-status', message);
    }
  };
  if (!payload?.apiKey) return { ok: false, error: '请先填写 API Key' };
  if (!payload.prompt?.trim()) return { ok: false, error: '请输入提示词' };

  try {
    const endpoint = new URL(payload.endpoint || DEFAULT_ENDPOINT);
    const base = endpoint.origin;
    const model = normalizeModel(payload.model?.trim() || 'gpt-image-2');
    const references = Array.isArray(payload.reference)
      ? payload.reference
      : [];
    const maxReferences = referenceLimit(model);
    if (references.length > maxReferences) {
      throw new Error(`${model} 最多支持 ${maxReferences} 张参考图`);
    }

    const body = generationBody(payload, model);
    report(`正在发送第 ${batchIndex + 1} 张图片...`);
    const response = await fetch(`${base}/v1/images/generations/async`, {
      method: 'POST',
      headers: requestHeaders(payload.apiKey, true),
      body: JSON.stringify(body),
    });
    const json = await responseJson(response, '图片接口');
    if (!response.ok) {
      throw new Error(
        json?.error?.message ||
          json?.message ||
          `提交失败 (${response.status})`,
      );
    }

    const taskId = taskIdOf(json);
    if (!taskId) {
      const items = imagesOf(json);
      if (!items.length) throw new Error('接口未返回 task_id 或图片数据');
      return {
        ok: true,
        ...(await saveGeneratedImages(items, {
          base,
          key: payload.apiKey,
          count: body.n,
        })),
      };
    }

    report(`第 ${batchIndex + 1} 张图片已进入队列，正在生成...`);
    let last = {};
    // The provider exposes an async task API; poll for at most ten minutes.
    for (let attempt = 0; attempt < 200; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const query = await fetch(`${base}/v1/images/tasks/${taskId}`, {
        headers: requestHeaders(payload.apiKey),
      });
      last = await responseJson(query, '任务查询');
      if (!query.ok) {
        throw new Error(
          last?.error?.message ||
            last?.message ||
            `查询生成任务失败（${query.status}）`,
        );
      }
      const state = statusOf(last);
      if (['succeeded', 'completed', 'success'].includes(state)) {
        return {
          ok: true,
          ...(await saveGeneratedImages(imagesOf(last), {
            base,
            key: payload.apiKey,
            taskId,
            count: body.n,
          })),
        };
      }
      if (['failed', 'error', 'cancelled', 'canceled'].includes(state)) {
        throw new Error(
          last?.error?.message || last?.message || `任务失败: ${state}`,
        );
      }
    }
    throw new Error(`任务轮询超时，最后状态：${statusOf(last) || '未知'}`);
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function registerGenerationHandler() {
  ipcMain.handle('generate', async (event, payload) => {
    const model = normalizeModel(payload?.model?.trim() || 'gpt-image-2');
    const total = Math.min(
      generationLimit(model),
      Math.max(1, Number(payload?.count) || 1),
    );
    const results = [];
    for (let index = 0; index < total; index++) {
      results.push(await generateOne(payload, index, event));
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
}

module.exports = { registerGenerationHandler };
