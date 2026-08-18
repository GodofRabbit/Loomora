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

function inputFor(payload, references) {
  const input = {
    prompt: String(payload.prompt || '').trim(),
    aspect_ratio: String(payload.aspect || '1:1'),
    output_format: ['png', 'jpeg', 'webp'].includes(payload.outputFormat)
      ? payload.outputFormat
      : 'png',
  };
  if (references.length) {
    input.image = references[0].data;
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
    .map((url) => ({ url }));
}

async function responseJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { detail: text };
  }
}

async function waitForPrediction(base, apiKey, prediction, signal) {
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
  }
  throw new Error('Replicate 任务等待超时');
}

const replicateProvider = {
  id: 'replicate',
  label: 'Replicate',
  capabilities: {
    textToImage: true,
    imageToImage: true,
    streaming: false,
    batch: false,
    partialPreview: false,
    polling: true,
    cancel: true,
  },
  async generate({ payload, references, signal }) {
    const base = endpointBase(payload.endpoint);
    const model = String(payload.model || '').trim();
    if (!model || !model.includes('/')) {
      throw new Error(
        'Replicate 模型应填写 owner/model，例如 black-forest-labs/flux-schnell',
      );
    }
    const response = await fetch(`${base}/v1/models/${model}/predictions`, {
      method: 'POST',
      headers: headers(payload.apiKey, true),
      body: JSON.stringify({ input: inputFor(payload, references) }),
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
    const result = await waitForPrediction(
      base,
      payload.apiKey,
      prediction,
      signal,
    );
    if (result.status !== 'succeeded') {
      throw new Error(
        result.error || `Replicate 任务${result.status || '失败'}`,
      );
    }
    const items = outputItems(result.output);
    if (!items.length) throw new Error('Replicate 未返回图片地址');
    return { kind: 'result', items, providerRequestId: result.id };
  },
  async cancel({ payload, requestId }) {
    if (!requestId) return { ok: false };
    const base = endpointBase(payload.endpoint);
    const response = await fetch(`${base}/v1/predictions/${requestId}/cancel`, {
      method: 'POST',
      headers: headers(payload.apiKey),
    });
    return { ok: response.ok };
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
};

module.exports = { replicateProvider };
