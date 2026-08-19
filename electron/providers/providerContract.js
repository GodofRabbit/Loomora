const MAX_GENERATION_COUNT = 10;
const DEFAULT_PROMPT_LIMIT = 4000;

const DEFAULT_CAPABILITIES = Object.freeze({
  textToImage: true,
  requiresEndpoint: true,
  requiresApiKey: true,
  imageToImage: false,
  references: false,
  maxReferences: 0,
  aspect: false,
  size: false,
  quality: false,
  outputFormat: false,
  streaming: false,
  partialPreview: false,
  polling: false,
  cancel: false,
  maxCount: 1,
  nativeBatchLimit: 1,
  promptLimit: DEFAULT_PROMPT_LIMIT,
  supportedAspects: null,
  supportedSizes: null,
});

function normalizedPrompt(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function normalizedReferences(payload = {}) {
  const values = Array.isArray(payload.references)
    ? payload.references
    : Array.isArray(payload.reference)
      ? payload.reference
      : [];
  return values
    .map((item, index) => ({
      name: String(item?.name || `参考图-${index + 1}`),
      data: String(item?.data || ''),
      mimeType: String(item?.mimeType || item?.mime || ''),
      source: String(item?.source || ''),
      role: String(item?.role || ''),
    }))
    .filter((item) => item.data);
}

function normalizeGenerationRequest(payload = {}) {
  const outputFormat = ['png', 'jpeg', 'webp'].includes(payload.outputFormat)
    ? payload.outputFormat
    : 'png';
  return {
    providerId: String(payload.providerId || 'openai-compatible'),
    profileId: String(payload.profileId || 'openai-main'),
    endpoint: String(payload.endpoint || '').trim(),
    apiKey: String(payload.apiKey || '').trim(),
    model: String(payload.model || '').trim(),
    prompt: normalizedPrompt(payload.prompt),
    aspect: String(payload.aspect || '1:1'),
    size: String(payload.size || '1024x1024'),
    quality: String(payload.quality || 'auto'),
    outputFormat,
    count: Math.min(
      MAX_GENERATION_COUNT,
      Math.max(1, Number(payload.count) || 1),
    ),
    references: normalizedReferences(payload),
    options:
      payload.options && typeof payload.options === 'object'
        ? { ...payload.options }
        : {},
  };
}

function normalizeCapabilities(capabilities = {}) {
  const merged = { ...DEFAULT_CAPABILITIES, ...capabilities };
  const references =
    merged.references !== false && merged.imageToImage !== false;
  const maxReferences = references
    ? Math.max(1, Number(merged.maxReferences) || 1)
    : 0;
  const maxCount = Math.min(
    MAX_GENERATION_COUNT,
    Math.max(1, Number(merged.maxCount) || 1),
  );
  const nativeBatchLimit = Math.min(
    maxCount,
    Math.max(1, Number(merged.nativeBatchLimit) || 1),
  );
  return {
    ...merged,
    references,
    maxReferences,
    maxCount,
    nativeBatchLimit,
    batch: maxCount > 1,
    promptLimit: Math.max(
      1,
      Number(merged.promptLimit) || DEFAULT_PROMPT_LIMIT,
    ),
  };
}

function resolveProviderCapabilities(provider, context = {}) {
  const dynamic = provider?.getCapabilities?.(context);
  if (dynamic && typeof dynamic.then === 'function') {
    throw new TypeError('Provider getCapabilities 必须同步返回能力信息');
  }
  return normalizeCapabilities({
    ...(provider?.capabilities || {}),
    ...(dynamic || {}),
  });
}

function validateGenerationRequest(provider, request, capabilities) {
  if (capabilities.requiresEndpoint !== false && !request.endpoint) {
    return '请先填写接口地址';
  }
  if (capabilities.requiresApiKey !== false && !request.apiKey) {
    return '请先填写 API Key';
  }
  if (!request.prompt) return '请输入提示词';
  if (Array.from(request.prompt).length > capabilities.promptLimit) {
    return `提示词最多支持 ${capabilities.promptLimit} 个字符`;
  }
  if (request.references.length && !capabilities.references) {
    return '当前服务或模型不支持参考图创作';
  }
  if (request.references.length > capabilities.maxReferences) {
    return `当前服务或模型最多支持 ${capabilities.maxReferences} 张参考图`;
  }
  if (request.count > capabilities.maxCount) {
    return `当前服务或模型最多生成 ${capabilities.maxCount} 张图片`;
  }
  const providerError = provider?.validateRequest?.({
    request,
    capabilities,
  });
  return providerError ? String(providerError) : '';
}

function planGenerationBatches(count, capabilities) {
  const batches = [];
  let remaining = Math.max(1, Number(count) || 1);
  while (remaining > 0) {
    const size = Math.min(remaining, capabilities.nativeBatchLimit);
    batches.push(size);
    remaining -= size;
  }
  return batches;
}

function normalizeImageItem(item) {
  if (!item) return null;
  if (typeof item === 'string') {
    return /^https?:\/\//i.test(item) ? { url: item } : null;
  }
  const url = String(
    item.url ||
      item.uri ||
      item.result_url ||
      item.imageUrl ||
      item.image_url ||
      '',
  ).trim();
  const base64 = String(
    item.base64 ||
      item.b64Json ||
      item.b64_json ||
      item.partial_image_b64 ||
      '',
  ).trim();
  if (!url && !base64) return null;
  return {
    ...(url ? { url } : {}),
    ...(base64 ? { base64 } : {}),
    mimeType: String(item.mimeType || item.mime_type || ''),
    authenticatedDownload: item.authenticatedDownload !== false,
  };
}

function normalizeProviderResult(result) {
  if (!result || result.kind !== 'result') {
    throw new TypeError('Provider 必须返回标准 result 结果');
  }
  const items = (Array.isArray(result.items) ? result.items : [])
    .map(normalizeImageItem)
    .filter(Boolean);
  if (!items.length) throw new Error('生图服务未返回图片数据');
  return {
    kind: 'result',
    items,
    providerRequestId: String(result.providerRequestId || ''),
    metadata:
      result.metadata && typeof result.metadata === 'object'
        ? result.metadata
        : {},
  };
}

module.exports = {
  DEFAULT_CAPABILITIES,
  DEFAULT_PROMPT_LIMIT,
  MAX_GENERATION_COUNT,
  normalizeCapabilities,
  normalizeGenerationRequest,
  normalizeImageItem,
  normalizeProviderResult,
  normalizedPrompt,
  planGenerationBatches,
  resolveProviderCapabilities,
  validateGenerationRequest,
};
