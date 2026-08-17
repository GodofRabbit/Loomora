const { ipcMain } = require('electron');
const { saveGeneratedImages } = require('./gallery');

const DEFAULT_ENDPOINT = 'https://api.openai.com';
const OPENAI_IMAGE_MODEL = 'gpt-image-2';
const PARTIAL_IMAGE_COUNT = 2;
const MAX_GENERATION_COUNT = 10;
const MAX_REFERENCE_COUNT = 16;
const DEFAULT_PROMPT_LIMIT = 4000;
const SIZE_BY_RATIO = {
  '1:1': '1024x1024',
  '16:9': '2048x1152',
  '9:16': '1152x2048',
  '4:3': '1536x1152',
  '3:4': '1152x1536',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
};
const MODEL_ALIASES = {
  'dall-e': OPENAI_IMAGE_MODEL,
  'dall-e-2': OPENAI_IMAGE_MODEL,
};

const USER_ERROR_RULES = [
  [
    /invalid api key|api key.*invalid|unauthorized|forbidden/i,
    'API 密钥无效或权限不足',
  ],
  [/rate limit|too many requests/i, '请求过于频繁，请稍后重试'],
  [/timed? out|timeout/i, '请求超时，请稍后重试'],
  [
    /failed to fetch|fetch failed|network|socket|dns|econnrefused|enotfound|econnreset/i,
    '网络连接异常，请检查网络后重试',
  ],
  [/invalid url/i, '接口地址无效，请检查后重试'],
  [/model.*not found|unsupported model/i, '所选模型不可用'],
  [/content policy|policy violation/i, '提示词未通过安全检查'],
  [/no such file|file not found/i, '文件不存在'],
  [/abort|cancel/i, '操作已取消'],
];

let activeGeneration = null;

const normalizeModel = (model) => MODEL_ALIASES[model] || OPENAI_IMAGE_MODEL;
const requestHeaders = (key, json = false) => ({
  Authorization: `Bearer ${key}`,
  ...(json ? { 'Content-Type': 'application/json' } : {}),
});

function formatUserError(value, fallback = '操作失败，请稍后重试') {
  const raw =
    typeof value === 'string'
      ? value
      : value?.message || value?.error?.message || '';
  const message = String(raw).trim();
  if (!message) return fallback;
  if (/[\u3400-\u9fff]/.test(message)) return message;
  const lower = message.toLowerCase();
  for (const [rule, text] of USER_ERROR_RULES) {
    if (rule.test(lower)) return text;
  }
  return fallback;
}

function endpointBase(endpoint) {
  const value = String(endpoint || DEFAULT_ENDPOINT).trim() || DEFAULT_ENDPOINT;
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`;
  const url = new URL(withProtocol);
  const path = url.pathname.replace(/\/+$/, '');
  const normalizedPath = path && path !== '/' ? path : '/v1';
  return `${url.origin}${normalizedPath}`;
}

function imagesOf(data) {
  if (!data) return [];
  if (data?.result_url) return [{ url: data.result_url }];
  if (Array.isArray(data?.data)) return data.data;
  if (data?.image && typeof data.image === 'object') {
    const nested = imagesOf(data.image);
    if (nested.length) return nested;
  }
  if (data?.data && typeof data.data === 'object') {
    const nested = imagesOf(data.data);
    if (nested.length) return nested;
  }
  return ['url', 'image_url', 'b64_json', 'base64', 'partial_image_b64'].some(
    (key) => data?.[key],
  )
    ? [data]
    : [];
}

function userFacingError(error) {
  const details = [error?.message, error?.cause?.message, error?.cause?.code]
    .filter(Boolean)
    .join(' ');
  if (/AbortError|aborted|cancelled|canceled/i.test(details)) {
    return '已取消生成';
  }
  if (/Invalid URL/i.test(details)) {
    return '接口地址无效，请检查 OpenAI 兼容接口地址';
  }
  if (/ENOTFOUND|getaddrinfo|ECONNREFUSED/i.test(details)) {
    return '无法连接到图片接口，请检查网络连接';
  }
  if (
    /terminated|fetch failed|ECONNRESET|UND_ERR_SOCKET|socket hang up/i.test(
      details,
    )
  ) {
    return '网络连接意外中断，请检查网络后重试';
  }
  if (
    /ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|AbortError|timed?\s*out/i.test(details)
  ) {
    return '接口响应超时，请稍后重试';
  }
  return formatUserError(error, '图片生成失败，请稍后重试');
}

function emitUpdate(event, payload) {
  if (!event.sender.isDestroyed()) {
    event.sender.send('generation-update', payload);
  }
}

function report(event, payload) {
  emitUpdate(event, payload);
}

function requestedSize(payload) {
  if (payload.size === 'auto' || isOpenAiImageSize(payload.size)) {
    return payload.size;
  }
  return SIZE_BY_RATIO[payload.aspect] || '1024x1024';
}

function isOpenAiImageSize(size) {
  const match = String(size || '').match(/^(\d+)x(\d+)$/);
  if (!match) return false;
  const width = Number(match[1]);
  const height = Number(match[2]);
  const pixels = width * height;
  const ratio = Math.max(width, height) / Math.min(width, height);
  return (
    width >= 1024 &&
    height >= 1024 &&
    width % 16 === 0 &&
    height % 16 === 0 &&
    pixels >= 1024 &&
    pixels <= 16777216 &&
    ratio < 3
  );
}

function requestedQuality(payload) {
  return ['low', 'medium', 'high', 'auto'].includes(payload.quality)
    ? payload.quality
    : 'auto';
}

function requestedOutputFormat(payload) {
  return ['png', 'jpeg', 'webp'].includes(payload.outputFormat)
    ? payload.outputFormat
    : 'png';
}

function generationBody(payload, model, { count = 1, stream = false } = {}) {
  return {
    model,
    prompt: payload.prompt.trim(),
    size: requestedSize(payload),
    quality: requestedQuality(payload),
    output_format: requestedOutputFormat(payload),
    ...(count > 1 ? { n: count } : {}),
    ...(stream ? { stream: true, partial_images: PARTIAL_IMAGE_COUNT } : {}),
  };
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(
    /^data:([^;,]+)(?:;[^,]*)?,([a-zA-Z0-9+/=\s]+)$/,
  );
  if (!match) throw new Error('参考图数据无效');
  return {
    mime: match[1],
    buffer: Buffer.from(match[2].replace(/\s/g, ''), 'base64'),
  };
}

function appendReferenceImages(form, references) {
  references.forEach((item, index) => {
    const { mime, buffer } = parseDataUrl(item.data);
    const extension = mime.includes('jpeg')
      ? 'jpg'
      : mime.includes('webp')
        ? 'webp'
        : 'png';
    const name = item.name || `reference-${index + 1}.${extension}`;
    form.append('image[]', new Blob([buffer], { type: mime }), name);
  });
}

function editBody(payload, model, references, options = {}) {
  const form = new FormData();
  const body = generationBody(payload, model, options);
  for (const [key, value] of Object.entries(body)) {
    form.append(key, String(value));
  }
  appendReferenceImages(form, references);
  return form;
}

async function responseText(response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text);
    return formatUserError(
      json?.error?.message || json?.message,
      `接口请求失败（${response.status}）`,
    );
  } catch {
    return formatUserError(text, `接口请求失败（${response.status}）`);
  }
}

async function responseJson(response, label = '接口') {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label}返回了无法解析的数据`);
  }
}

function parseSseMessage(message) {
  const normalized = message.replace(/\r/g, '');
  const lines = normalized.split('\n');
  let name = '';
  const data = [];
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      name = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).trimStart());
    }
  }
  if (!data.length) return null;
  const raw = data.join('\n');
  if (raw === '[DONE]') return null;
  try {
    const payload = JSON.parse(raw);
    return { name: name || payload.type || 'message', payload };
  } catch {
    return { name: name || 'message', payload: raw };
  }
}

async function* readSse(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('当前环境不支持流式响应');
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const message = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = parseSseMessage(message);
      if (event) yield event;
      boundary = buffer.indexOf('\n\n');
    }
  }

  buffer += decoder.decode();
  buffer = buffer.replace(/\r\n/g, '\n');
  const leftover = buffer.trim();
  if (leftover) {
    const event = parseSseMessage(leftover);
    if (event) yield event;
  }
}

function previewFromItem(item, outputFormat = 'png') {
  const base64 = item?.b64_json || item?.base64 || item?.partial_image_b64;
  if (!base64) return '';
  const mime =
    item?.mime_type ||
    (outputFormat === 'jpeg' ? 'image/jpeg' : `image/${outputFormat}`);
  return `data:${mime};base64,${base64.replace(/^data:[^,]+,/, '')}`;
}

async function consumeImageStream(
  response,
  { event, batchIndex, total, outputFormat = 'png' },
) {
  let latestItem = null;
  let partial = 0;
  for await (const { name, payload } of readSse(response)) {
    const items = imagesOf(payload);
    if (items.length) latestItem = items[0];

    if (name.includes('partial_image')) {
      partial += 1;
      const preview = previewFromItem(items[0] || latestItem, outputFormat);
      report(event, {
        phase: 'partial',
        batchIndex,
        total,
        completed: batchIndex,
        partial,
        preview,
        message: `第 ${batchIndex + 1}/${total} 张预览已更新`,
      });
      continue;
    }

    if (name.includes('completed')) {
      const finalItems = items.length ? items : latestItem ? [latestItem] : [];
      if (!finalItems.length) throw new Error('接口未返回图片数据');
      return finalItems[0];
    }
  }

  if (latestItem) return latestItem;
  throw new Error('接口流式响应未返回图片数据');
}

async function sendOpenAiRequest(
  payload,
  model,
  references,
  signal,
  options = {},
) {
  const useEdit = references.length > 0;
  const base = endpointBase(payload.endpoint);
  const stream = Boolean(options.stream);
  const count = Math.max(1, Number(options.count) || 1);
  const response = await fetch(
    `${base}/images/${useEdit ? 'edits' : 'generations'}`,
    {
      method: 'POST',
      headers: requestHeaders(payload.apiKey, !useEdit),
      body: useEdit
        ? editBody(payload, model, references, { count, stream })
        : JSON.stringify(generationBody(payload, model, { count, stream })),
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(await responseText(response));
  }

  return response;
}

async function generateSingle(payload, event, signal) {
  if (!payload?.apiKey) return { ok: false, error: '请先填写 API Key' };
  if (!payload.prompt?.trim()) return { ok: false, error: '请输入提示词' };
  const model = normalizeModel(payload.model?.trim() || OPENAI_IMAGE_MODEL);
  if (payload.prompt.length > DEFAULT_PROMPT_LIMIT) {
    return {
      ok: false,
      error: `提示词最多支持 ${DEFAULT_PROMPT_LIMIT} 个字符`,
    };
  }

  const references = Array.isArray(payload.reference) ? payload.reference : [];
  if (references.length > MAX_REFERENCE_COUNT) {
    return { ok: false, error: `最多支持 ${MAX_REFERENCE_COUNT} 张参考图` };
  }

  try {
    report(event, {
      phase: 'batch-start',
      batchIndex: 0,
      total: 1,
      completed: 0,
      partial: 0,
      message: '正在生成 1 张图片...',
    });

    const response = await sendOpenAiRequest(
      payload,
      model,
      references,
      signal,
      { count: 1, stream: true },
    );
    const finalItem = await consumeImageStream(response, {
      event,
      batchIndex: 0,
      total: 1,
      outputFormat: requestedOutputFormat(payload),
    });
    const saved = await saveGeneratedImages([finalItem], {
      key: payload.apiKey,
      outputFormat: requestedOutputFormat(payload),
    });
    const image = saved.images[0];
    const localPath = saved.localPaths[0];
    report(event, {
      phase: 'batch-complete',
      batchIndex: 0,
      total: 1,
      completed: 1,
      partial: PARTIAL_IMAGE_COUNT,
      image,
      localPath,
      message: '第 1/1 张已完成',
    });
    return { ok: true, ...saved };
  } catch (error) {
    const cancelled = signal.aborted || /AbortError/i.test(error?.name || '');
    const message = cancelled ? '已取消生成' : userFacingError(error);
    report(event, {
      phase: cancelled ? 'cancelled' : 'batch-error',
      batchIndex: 0,
      total: 1,
      completed: 0,
      message,
    });
    return { ok: false, cancelled, error: message };
  }
}

async function generateBatch(payload, total, event, signal) {
  if (!payload?.apiKey) return { ok: false, error: '请先填写 API Key' };
  if (!payload.prompt?.trim()) return { ok: false, error: '请输入提示词' };
  const model = normalizeModel(payload.model?.trim() || OPENAI_IMAGE_MODEL);
  if (payload.prompt.length > DEFAULT_PROMPT_LIMIT) {
    return {
      ok: false,
      error: `提示词最多支持 ${DEFAULT_PROMPT_LIMIT} 个字符`,
    };
  }

  const references = Array.isArray(payload.reference) ? payload.reference : [];
  if (references.length > MAX_REFERENCE_COUNT) {
    return { ok: false, error: `最多支持 ${MAX_REFERENCE_COUNT} 张参考图` };
  }

  try {
    report(event, {
      phase: 'batch-start',
      batchIndex: 0,
      total,
      completed: 0,
      partial: 0,
      message: `正在抽卡队列中，等待 ${total} 张作品...`,
    });

    const response = await sendOpenAiRequest(
      payload,
      model,
      references,
      signal,
      { count: total, stream: false },
    );
    const json = await responseJson(response, '图片接口');
    if (!response.ok) {
      throw new Error(
        json?.error?.message ||
          json?.message ||
          `提交失败 (${response.status})`,
      );
    }

    const items = imagesOf(json);
    if (!items.length) throw new Error('接口未返回图片数据');
    const saved = await saveGeneratedImages(items, {
      key: payload.apiKey,
      outputFormat: requestedOutputFormat(payload),
    });
    report(event, {
      phase: 'batch-complete',
      batchIndex: 0,
      total,
      completed: saved.images.length,
      partial: 0,
      images: saved.images,
      localPaths: saved.localPaths,
      message: `抽卡完成，共 ${saved.images.length} 张图片`,
    });
    return { ok: true, ...saved };
  } catch (error) {
    const cancelled = signal.aborted || /AbortError/i.test(error?.name || '');
    const message = cancelled ? '已取消生成' : userFacingError(error);
    report(event, {
      phase: cancelled ? 'cancelled' : 'batch-error',
      batchIndex: 0,
      total,
      completed: 0,
      message,
    });
    return { ok: false, cancelled, error: message };
  }
}

function registerGenerationHandler() {
  ipcMain.handle('generate', async (event, payload) => {
    if (activeGeneration) {
      return { ok: false, error: '已有图片正在生成，请稍候' };
    }

    const controller = new AbortController();
    activeGeneration = { controller };
    const total = Math.min(
      MAX_GENERATION_COUNT,
      Math.max(1, Number(payload?.count) || 1),
    );

    try {
      const result =
        total === 1
          ? await generateSingle(payload, event, controller.signal)
          : await generateBatch(payload, total, event, controller.signal);
      const summary = {
        ok: Boolean(result.ok),
        images: result.images || [],
        localPaths: result.localPaths || [],
        folder: result.folder,
        error: result.error,
        failedCount: result.failedCount || 0,
        cancelled: Boolean(result.cancelled),
      };
      report(event, {
        phase: summary.cancelled ? 'cancelled' : 'done',
        ok: summary.ok,
        total,
        completed: summary.images.length,
        failed: summary.failedCount,
        message: summary.cancelled
          ? '已取消生成'
          : summary.error
            ? summary.error
            : total === 1
              ? '生成完成'
              : `生成完成，共 ${summary.images.length} 张图片`,
      });
      return summary;
    } finally {
      activeGeneration = null;
    }
  });

  ipcMain.handle('cancel-generate', async () => {
    if (!activeGeneration) return { cancelled: false };
    activeGeneration.controller.abort();
    return { cancelled: true };
  });
}

module.exports = { registerGenerationHandler };
