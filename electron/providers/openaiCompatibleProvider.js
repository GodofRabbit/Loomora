const DEFAULT_ENDPOINT = 'https://api.openai.com';
const PARTIAL_IMAGE_COUNT = 2;

function endpointBase(endpoint) {
  const value = String(endpoint || '').trim() || DEFAULT_ENDPOINT;
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`;
  const url = new URL(withProtocol);
  const path = url.pathname.replace(/\/+$/, '');
  const normalizedPath = path && path !== '/' ? path : '/v1';
  return `${url.origin}${normalizedPath}`;
}

function requestHeaders(key, json = false) {
  return {
    Authorization: `Bearer ${key}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

function requestedSize(payload) {
  if (payload.size === 'auto' || /^\d+x\d+$/.test(String(payload.size || ''))) {
    return payload.size;
  }
  return '1024x1024';
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

function generationBody(payload, { count = 1, stream = false } = {}) {
  return {
    model: String(payload.model || '').trim(),
    prompt: String(payload.prompt || '').trim(),
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
    form.append(
      'image[]',
      new Blob([buffer], { type: mime }),
      item.name || `reference-${index + 1}.${extension}`,
    );
  });
}

function editBody(payload, references, options) {
  const form = new FormData();
  const body = generationBody(payload, options);
  for (const [key, value] of Object.entries(body))
    form.append(key, String(value));
  appendReferenceImages(form, references);
  return form;
}

const openAiCompatibleProvider = {
  id: 'openai-compatible',
  label: 'OpenAI 兼容接口',
  capabilities: {
    textToImage: true,
    imageToImage: true,
    streaming: true,
    batch: true,
    partialPreview: true,
    polling: false,
    cancel: true,
  },
  async generate({ payload, references, signal, count = 1, stream = false }) {
    const useEdit = references.length > 0;
    const base = endpointBase(payload.endpoint);
    const response = await fetch(
      `${base}/images/${useEdit ? 'edits' : 'generations'}`,
      {
        method: 'POST',
        headers: requestHeaders(payload.apiKey, !useEdit),
        body: useEdit
          ? editBody(payload, references, { count, stream })
          : JSON.stringify(generationBody(payload, { count, stream })),
        signal,
      },
    );
    return { kind: 'response', response };
  },
  async testConnection({ endpoint, apiKey }) {
    const base = endpointBase(endpoint);
    const response = await fetch(`${base}/models`, {
      headers: requestHeaders(apiKey),
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`接口连接失败 (${response.status})`);
    }
    return {
      ok: true,
      message:
        response.status === 404
          ? '接口地址可访问，但未提供模型列表'
          : '接口连接成功',
    };
  },
};

module.exports = { openAiCompatibleProvider };
