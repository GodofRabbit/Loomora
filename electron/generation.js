const { ipcMain } = require('electron');
const { saveGeneratedImages } = require('./gallery');
const { getProvider } = require('./providers');
const {
  normalizeGenerationRequest,
  normalizeImageItem,
  normalizeProviderResult,
  planGenerationBatches,
  resolveProviderCapabilities,
  validateGenerationRequest,
} = require('./providers/providerContract');

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

function formatUserError(value, fallback = '操作失败，请稍后重试') {
  const raw =
    typeof value === 'string'
      ? value
      : value?.message || value?.error?.message || '';
  const message = String(raw).trim();
  if (!message) return fallback;
  if (/[\u3400-\u9fff]/.test(message)) return message;
  for (const [rule, text] of USER_ERROR_RULES) {
    if (rule.test(message)) return text;
  }
  return fallback;
}

function userFacingError(error) {
  const details = [error?.message, error?.cause?.message, error?.cause?.code]
    .filter(Boolean)
    .join(' ');
  if (/AbortError|aborted|cancelled|canceled/i.test(details)) {
    return '已取消生成';
  }
  if (/Invalid URL/i.test(details)) {
    return '接口地址无效，请检查当前服务配置';
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
  if (/ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|timed?\s*out/i.test(details)) {
    return '接口响应超时，请稍后重试';
  }
  return formatUserError(error, '图片生成失败，请稍后重试');
}

function report(event, payload) {
  if (!event.sender.isDestroyed()) {
    event.sender.send('generation-update', payload);
  }
}

function previewFromItem(value, outputFormat) {
  const item = normalizeImageItem(value);
  if (!item?.base64) return '';
  if (item.base64.startsWith('data:image/')) return item.base64;
  const mime =
    item.mimeType ||
    (outputFormat === 'jpeg' ? 'image/jpeg' : `image/${outputFormat}`);
  return `data:${mime};base64,${item.base64}`;
}

function progressReporter(event, request, batchIndex, total, completed) {
  return (update = {}) => {
    const message = String(update.message || '');
    if (update.phase === 'partial') {
      report(event, {
        phase: 'partial',
        batchIndex,
        total,
        completed,
        partial: Math.max(1, Number(update.partial) || 1),
        preview: previewFromItem(update.item, request.outputFormat),
        message: message || `第 ${completed + 1}/${total} 张预览已更新`,
      });
      return;
    }
    if (message) {
      report(event, {
        phase: 'provider-progress',
        batchIndex,
        total,
        completed,
        message,
      });
    }
  };
}

async function executeGeneration({
  provider,
  request,
  capabilities,
  event,
  signal,
}) {
  const batches = planGenerationBatches(request.count, capabilities);
  const images = [];
  const localPaths = [];
  let folder = '';
  let completed = 0;

  try {
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batchCount = batches[batchIndex];
      report(event, {
        phase: 'batch-start',
        batchIndex,
        total: request.count,
        completed,
        partial: 0,
        message:
          batches.length === 1
            ? `正在生成 ${request.count} 张图片...`
            : `正在处理第 ${batchIndex + 1}/${batches.length} 批图片...`,
      });

      const providerResult = normalizeProviderResult(
        await provider.generate({
          request,
          signal,
          count: batchCount,
          onProgress: progressReporter(
            event,
            request,
            batchIndex,
            request.count,
            completed,
          ),
        }),
      );
      const saved = await saveGeneratedImages(
        providerResult.items.slice(0, batchCount),
        {
          key: request.apiKey,
          outputFormat: request.outputFormat,
        },
      );
      images.push(...saved.images);
      localPaths.push(...saved.localPaths);
      folder = saved.folder || folder;
      completed = images.length;
      report(event, {
        phase: 'batch-complete',
        batchIndex,
        total: request.count,
        completed,
        partial: 0,
        images: [...images],
        localPaths: [...localPaths],
        message: `已完成 ${completed}/${request.count} 张图片`,
      });
    }

    const failedCount = Math.max(0, request.count - completed);
    return {
      ok: failedCount === 0,
      images,
      localPaths,
      folder,
      failedCount,
      error: failedCount ? `生图服务仅返回了 ${completed} 张图片` : '',
    };
  } catch (error) {
    const cancelled = signal.aborted || /AbortError/i.test(error?.name || '');
    const message = cancelled ? '已取消生成' : userFacingError(error);
    report(event, {
      phase: cancelled ? 'cancelled' : 'batch-error',
      batchIndex: Math.max(0, batches.length - 1),
      total: request.count,
      completed,
      failed: Math.max(0, request.count - completed),
      message,
    });
    return {
      ok: false,
      cancelled,
      error: message,
      images,
      localPaths,
      folder,
      failedCount: Math.max(0, request.count - completed),
    };
  }
}

function invalidRequestResult(event, error) {
  report(event, {
    phase: 'done',
    ok: false,
    total: 0,
    completed: 0,
    failed: 0,
    message: error,
  });
  return { ok: false, error, failedCount: 0 };
}

function registerGenerationHandler() {
  ipcMain.handle('generate', async (event, payload) => {
    if (activeGeneration) {
      return { ok: false, error: '已有图片正在生成，请稍候' };
    }

    const request = normalizeGenerationRequest(payload);
    const provider = getProvider(request.providerId);
    if (!provider) {
      return invalidRequestResult(
        event,
        `未找到生图服务：${request.providerId}`,
      );
    }
    const capabilities = resolveProviderCapabilities(provider, request);
    const validationError = validateGenerationRequest(
      provider,
      request,
      capabilities,
    );
    if (validationError) return invalidRequestResult(event, validationError);

    const controller = new AbortController();
    activeGeneration = { controller, providerId: provider.id };
    try {
      const result = await executeGeneration({
        provider,
        request,
        capabilities,
        event,
        signal: controller.signal,
      });
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
        total: request.count,
        completed: summary.images.length,
        failed: summary.failedCount,
        message: summary.cancelled
          ? '已取消生成'
          : summary.error ||
            (request.count === 1
              ? '生成完成'
              : `生成完成，共 ${summary.images.length} 张图片`),
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
