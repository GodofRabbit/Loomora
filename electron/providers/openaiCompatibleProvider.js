const DEFAULT_ENDPOINT = 'https://api.openai.com';
const DEFAULT_MODEL = 'gpt-image-2';
const PARTIAL_IMAGE_COUNT = 2;
const MODEL_ALIASES = {
  'dall-e': DEFAULT_MODEL,
  'dall-e-2': DEFAULT_MODEL,
};

function sanitizeEndpoint(endpoint) {
  return String(endpoint || '')
    .trim()
    .replace(/[\s,，、。]+$/u, '');
}

function endpointBase(endpoint) {
  const value = sanitizeEndpoint(endpoint) || DEFAULT_ENDPOINT;
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`;
  const url = new URL(withProtocol);
  const path = url.pathname.replace(/\/+$/, '');
  const normalizedPath = path && path !== '/' ? path : '/v1';
  return `${url.origin}${normalizedPath}`;
}

function isOfficialOpenAiEndpoint(endpoint) {
  try {
    const value = sanitizeEndpoint(endpoint) || DEFAULT_ENDPOINT;
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
      ? value
      : `https://${value}`;
    return new URL(withProtocol).hostname.toLowerCase() === 'api.openai.com';
  } catch {
    return false;
  }
}

function requestHeaders(key, json = false) {
  return {
    Authorization: `Bearer ${key}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

function requestedSize(request) {
  return request.size === 'auto' || /^\d+x\d+$/.test(request.size)
    ? request.size
    : '1024x1024';
}

function requestedQuality(request) {
  return ['low', 'medium', 'high', 'auto'].includes(request.quality)
    ? request.quality
    : 'auto';
}

function generationBody(request, { count = 1, stream = false } = {}) {
  return {
    model: MODEL_ALIASES[request.model] || request.model || DEFAULT_MODEL,
    prompt: request.prompt,
    size: requestedSize(request),
    quality: requestedQuality(request),
    output_format: request.outputFormat,
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
    form.append(
      'image[]',
      new Blob([buffer], { type: mime }),
      item.name || `reference-${index + 1}.${extension}`,
    );
  });
}

function editBody(request, options) {
  const form = new FormData();
  for (const [key, value] of Object.entries(generationBody(request, options))) {
    form.append(key, String(value));
  }
  appendReferenceImages(form, request.references);
  return form;
}

async function responsePayload(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    if (!response.ok)
      throw new Error(text || `接口请求失败（${response.status}）`);
    throw new Error('图片接口返回了无法解析的数据');
  }
}

function responseItems(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.images)) return payload.images;
  if (payload?.image && typeof payload.image === 'object') {
    const nested = responseItems(payload.image);
    if (nested.length) return nested;
  }
  if (payload?.data && typeof payload.data === 'object') {
    const nested = responseItems(payload.data);
    if (nested.length) return nested;
  }
  return [
    'url',
    'image_url',
    'result_url',
    'b64_json',
    'base64',
    'partial_image_b64',
  ].some((key) => payload?.[key])
    ? [payload]
    : [];
}

function errorMessage(payload, status) {
  return String(
    payload?.error?.message ||
      payload?.message ||
      payload?.detail ||
      `接口请求失败（${status}）`,
  );
}

function parseSseMessage(message) {
  const lines = message.replace(/\r/g, '').split('\n');
  let name = '';
  const data = [];
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) name = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (!data.length || data.join('\n') === '[DONE]') return null;
  const raw = data.join('\n');
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
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const event = parseSseMessage(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      if (event) yield event;
      boundary = buffer.indexOf('\n\n');
    }
  }
  buffer += decoder.decode();
  const leftover = buffer.trim();
  if (leftover) {
    const event = parseSseMessage(leftover);
    if (event) yield event;
  }
}

function streamItem(payload) {
  return responseItems(payload)[0] || payload?.data || payload;
}

async function consumeImageStream(response, onProgress) {
  let latestItem = null;
  let partial = 0;
  for await (const { name, payload } of readSse(response)) {
    const item = streamItem(payload);
    if (item && typeof item === 'object') latestItem = item;
    if (name.includes('partial_image')) {
      partial += 1;
      onProgress?.({ phase: 'partial', item: latestItem, partial });
    }
    if (name.includes('completed') && latestItem) return [latestItem];
  }
  if (latestItem) return [latestItem];
  throw new Error('接口流式响应未返回图片数据');
}

async function requestImages({ request, signal, count, stream, onProgress }) {
  const useEdit = request.references.length > 0;
  const base = endpointBase(request.endpoint);
  const response = await fetch(
    `${base}/images/${useEdit ? 'edits' : 'generations'}`,
    {
      method: 'POST',
      headers: requestHeaders(request.apiKey, !useEdit),
      body: useEdit
        ? editBody(request, { count, stream })
        : JSON.stringify(generationBody(request, { count, stream })),
      signal,
    },
  );
  if (!response.ok) {
    const payload = await responsePayload(response);
    throw new Error(errorMessage(payload, response.status));
  }
  if (stream) return consumeImageStream(response, onProgress);
  const payload = await responsePayload(response);
  const items = responseItems(payload);
  if (!items.length) throw new Error('图片接口未返回图片数据');
  return items;
}

const openAiCompatibleProvider = {
  id: 'openai-compatible',
  label: 'OpenAI 兼容接口',
  capabilities: {
    textToImage: true,
    requiresEndpoint: true,
    requiresApiKey: true,
    imageToImage: true,
    references: true,
    maxReferences: 16,
    aspect: true,
    size: true,
    quality: true,
    outputFormat: true,
    streaming: true,
    partialPreview: true,
    polling: false,
    cancel: true,
    maxCount: 10,
    nativeBatchLimit: 10,
    promptLimit: 4000,
    supportedAspects: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
  },
  getCapabilities({ endpoint } = {}) {
    const streaming = !endpoint || isOfficialOpenAiEndpoint(endpoint);
    return { streaming, partialPreview: streaming };
  },
  async generate({ request, signal, count = 1, onProgress }) {
    const preferStream =
      count === 1 && isOfficialOpenAiEndpoint(request.endpoint);
    let items;
    try {
      items = await requestImages({
        request,
        signal,
        count,
        stream: preferStream,
        onProgress,
      });
    } catch (error) {
      const cancelled = signal.aborted || /AbortError/i.test(error?.name || '');
      if (cancelled || !preferStream) throw error;
      onProgress?.({
        phase: 'fallback',
        message: '流式响应不稳定，正在切换普通生成...',
      });
      items = await requestImages({
        request,
        signal,
        count,
        stream: false,
        onProgress,
      });
    }
    return { kind: 'result', items };
  },
  async testConnection({ endpoint, apiKey }) {
    const base = endpointBase(endpoint);
    const response = await fetch(`${base}/models`, {
      headers: requestHeaders(apiKey),
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`接口连接失败（${response.status}）`);
    }
    return {
      ok: true,
      message:
        response.status === 404
          ? '接口地址可访问，但未提供模型列表'
          : '接口连接成功',
    };
  },
  async listModels({ endpoint, apiKey }) {
    const base = endpointBase(endpoint);
    const response = await fetch(`${base}/models`, {
      headers: requestHeaders(apiKey),
    });
    const payload = await responsePayload(response);
    if (!response.ok) {
      throw new Error(`模型列表获取失败（${response.status}）`);
    }
    const models = Array.isArray(payload.data)
      ? payload.data
          .map((item) => String(item?.id || '').trim())
          .filter(Boolean)
      : [];
    return { ok: true, models };
  },
};

module.exports = {
  endpointBase,
  isOfficialOpenAiEndpoint,
  openAiCompatibleProvider,
  sanitizeEndpoint,
};
