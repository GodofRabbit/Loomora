const DEFAULT_ENDPOINT = 'https://api.replicate.com';
const POLL_INTERVAL = 1200;
const MAX_POLL_COUNT = 250;

function endpointBase(endpoint) {
  const value = String(endpoint || DEFAULT_ENDPOINT).trim() || DEFAULT_ENDPOINT;
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`;
  return withProtocol.replace(/\/+$/, '');
}

function headers(apiKey, json = false) {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

function inputFor(request) {
  const input = {
    prompt: request.prompt,
    aspect_ratio: request.aspect,
    output_format: ['png', 'jpeg', 'webp'].includes(request.outputFormat)
      ? request.outputFormat
      : 'png',
  };
  if (request.references.length) {
    input.image = request.references[0].data;
  }
  return input;
}

function outputItems(output) {
  const values = Array.isArray(output) ? output : [output];
  return values
    .map((value) =>
      typeof value === 'string' ? value : value?.url || value?.uri || '',
    )
    .filter((url) => /^https?:\/\//i.test(url))
    .map((url) => ({ url, authenticatedDownload: false }));
}

async function cancelPrediction(base, apiKey, requestId) {
  if (!requestId) return false;
  const response = await fetch(`${base}/v1/predictions/${requestId}/cancel`, {
    method: 'POST',
    headers: headers(apiKey),
  });
  return response.ok;
}

async function responseJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { detail: text };
  }
}

async function waitForPrediction(base, apiKey, prediction, signal, onProgress) {
  let current = prediction;
  for (let index = 0; index < MAX_POLL_COUNT; index += 1) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (['succeeded', 'failed', 'canceled'].includes(current.status))
      return current;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, POLL_INTERVAL);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
    const url = current.urls?.get || `${base}/v1/predictions/${current.id}`;
    const response = await fetch(url, {
      headers: headers(apiKey),
      signal,
    });
    current = await responseJson(response);
    if (!response.ok)
      throw new Error(
        current.detail || current.error || 'Replicate 任务查询失败',
      );
    onProgress?.({
      phase: 'provider-progress',
      message: `Replicate 任务状态：${current.status || '处理中'}`,
      metadata: { status: current.status },
    });
  }
  throw new Error('Replicate 任务等待超时');
}

const replicateProvider = {
  id: 'replicate',
  label: 'Replicate',
  capabilities: {
    textToImage: true,
    requiresEndpoint: true,
    requiresApiKey: true,
    imageToImage: true,
    references: true,
    aspect: true,
    size: false,
    quality: false,
    outputFormat: true,
    streaming: false,
    batch: false,
    partialPreview: false,
    polling: true,
    cancel: true,
    maxReferences: 1,
    maxCount: 1,
    nativeBatchLimit: 1,
    promptLimit: 4000,
    supportedAspects: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
  },
  validateRequest({ request }) {
    const model = String(request.model || '').trim();
    if (!model || !model.includes('/')) {
      return 'Replicate 模型应填写 owner/model，例如 black-forest-labs/flux-schnell';
    }
    return '';
  },
  async generate({ request, signal, onProgress }) {
    const base = endpointBase(request.endpoint);
    const model = request.model;
    const response = await fetch(`${base}/v1/models/${model}/predictions`, {
      method: 'POST',
      headers: headers(request.apiKey, true),
      body: JSON.stringify({ input: inputFor(request) }),
      signal,
    });
    const prediction = await responseJson(response);
    if (!response.ok) {
      throw new Error(
        prediction.detail ||
          prediction.error ||
          `Replicate 请求失败 (${response.status})`,
      );
    }
    if (!prediction.id) throw new Error('Replicate 未返回任务编号');
    const cancelOnAbort = () => {
      cancelPrediction(base, request.apiKey, prediction.id).catch(() => {});
    };
    signal.addEventListener('abort', cancelOnAbort, { once: true });
    let result;
    try {
      result = await waitForPrediction(
        base,
        request.apiKey,
        prediction,
        signal,
        onProgress,
      );
    } finally {
      signal.removeEventListener('abort', cancelOnAbort);
    }
    if (result.status !== 'succeeded') {
      throw new Error(
        result.error || `Replicate 任务${result.status || '失败'}`,
      );
    }
    const items = outputItems(result.output);
    if (!items.length) throw new Error('Replicate 未返回图片地址');
    return { kind: 'result', items, providerRequestId: result.id };
  },
  async cancel({ request, requestId }) {
    const base = endpointBase(request.endpoint);
    return { ok: await cancelPrediction(base, request.apiKey, requestId) };
  },
  async testConnection({ endpoint, apiKey }) {
    const base = endpointBase(endpoint);
    const response = await fetch(`${base}/v1/models`, {
      headers: headers(apiKey),
    });
    if (!response.ok)
      throw new Error(`Replicate 连接失败 (${response.status})`);
    return { ok: true, message: 'Replicate 连接成功' };
  },
  async listModels({ endpoint, apiKey }) {
    const base = endpointBase(endpoint);
    const response = await fetch(`${base}/v1/models?limit=100`, {
      headers: headers(apiKey),
    });
    const payload = await responseJson(response);
    if (!response.ok) {
      throw new Error(
        payload.detail || `Replicate 模型列表获取失败 (${response.status})`,
      );
    }
    const models = Array.isArray(payload.results)
      ? payload.results
          .map((item) =>
            String(
              item?.id ||
                (item?.owner && item?.name ? `${item.owner}/${item.name}` : ''),
            ).trim(),
          )
          .filter(Boolean)
      : [];
    return { ok: true, models };
  },
};

module.exports = { replicateProvider };
