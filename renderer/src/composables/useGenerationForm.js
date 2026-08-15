import { computed, ref, watch } from 'vue';
import {
  API_KEY_STORAGE,
  DEFAULT_ENDPOINT,
  DEFAULT_PROMPT_LIMIT,
  ENDPOINT_STORAGE,
  OPENAI_API_BASE,
  OPENAI_IMAGE_MODEL,
  gptRatios,
  gptSizes,
  modelAliases,
  modelOptions,
  promptLimits,
} from '../config/imageModels';
import { formatUserMessage } from '../utils/userMessages';

const qualityOptions = [
  { value: 'auto', label: '自动' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

const outputFormatOptions = [
  { value: 'png', label: 'PNG（通用）' },
  { value: 'jpeg', label: 'JPEG（兼容）' },
  { value: 'webp', label: 'WEBP（轻量）' },
];

const sizeByRatio = {
  '1:1': '1024x1024',
  '16:9': '2048x1152',
  '9:16': '1152x2048',
  '4:3': '1536x1152',
  '3:4': '1152x1536',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
};

const ratioLabels = {
  '1:1': '1:1 方图 / 头像',
  '16:9': '16:9 横屏 / 视频封面',
  '9:16': '9:16 竖屏 / 手机故事',
  '4:3': '4:3 横向 / 产品照',
  '3:4': '3:4 竖向 / 人像',
  '3:2': '3:2 摄影 / 横构图',
  '2:3': '2:3 竖版 / 海报',
};
const legacyOpenAiEndpointPattern = /^https:\/\/api\.openai\.com\/v1\/?$/i;

function normalizeEndpoint(value) {
  const endpoint = String(value || '').trim();
  return legacyOpenAiEndpointPattern.test(endpoint)
    ? OPENAI_API_BASE
    : endpoint || DEFAULT_ENDPOINT;
}

function readPastedImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('无法读取剪贴板图片'));
    reader.readAsDataURL(file);
  });
}

export function useGenerationForm({ status, showToast }) {
  const prompt = ref('');
  const ratio = ref('1:1');
  const count = ref(1);
  const reference = ref([]);
  const conversationHistory = ref([]);
  const images = ref([]);
  const imagePaths = ref([]);
  const liveImage = ref('');
  const liveMessage = ref('');
  const generationMode = ref('idle');
  const generationPhase = ref('idle');
  const generationProgress = ref({
    batchIndex: 0,
    total: 0,
    completed: 0,
    failed: 0,
    partial: 0,
  });
  const busy = ref(false);
  const endpoint = ref(
    normalizeEndpoint(localStorage.getItem(ENDPOINT_STORAGE)),
  );
  const apiKey = ref(localStorage.getItem(API_KEY_STORAGE) || '');
  const model = ref(OPENAI_IMAGE_MODEL);
  const resolution = ref('auto');
  const quality = ref('auto');
  const outputFormat = ref('png');
  const settingsEndpoint = ref(endpoint.value);
  const settingsApiKey = ref(apiKey.value);
  const activeConversationId = ref('');

  const normalizedModel = computed(() => {
    const value = model.value.trim();
    return modelAliases[value] || value;
  });
  const modelIsGpt = computed(() => normalizedModel.value === OPENAI_IMAGE_MODEL);
  const modelIsGemini = computed(() => false);
  const ratioOptions = computed(() =>
    gptRatios.map((value) => ({ value, label: ratioLabels[value] || value })),
  );
  const resolutionOptions = computed(() =>
    gptSizes.map((item) => ({ ...item })),
  );
  const promptLimit = computed(
    () => promptLimits[normalizedModel.value] || DEFAULT_PROMPT_LIMIT,
  );
  const counter = computed(() => `${prompt.value.length}/${promptLimit.value}`);
  const maxReferences = computed(() => 16);
  const maxCount = computed(
    () =>
      modelOptions.find((option) => option.value === normalizedModel.value)
        ?.maxCount || 1,
  );
  const qualityOptionsValue = computed(() => qualityOptions);

  watch(model, () => {
    ratio.value = '1:1';
    resolution.value = 'auto';
    quality.value = 'auto';
    outputFormat.value = 'png';
    count.value = Math.min(count.value, maxCount.value);
    if (reference.value.length > maxReferences.value) {
      status.value = `${normalizedModel.value} 最多支持 ${maxReferences.value} 张参考图`;
    }
  });

  function resetGenerationState() {
    images.value = [];
    imagePaths.value = [];
    liveImage.value = '';
    liveMessage.value = '';
    generationMode.value = 'idle';
    generationPhase.value = 'idle';
    generationProgress.value = {
      batchIndex: 0,
      total: 0,
      completed: 0,
      failed: 0,
      partial: 0,
    };
  }

  function createConversationTurn(total) {
    const turn = {
      id: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      prompt: prompt.value.trim(),
      model: normalizedModel.value,
      ratio: ratio.value,
      resolution: getRequestedSize(),
      quality: quality.value,
      outputFormat: outputFormat.value,
      count: total,
      referenceCount: reference.value.length,
      mode: total > 1 ? 'batch' : 'stream',
      status: 'running',
      message: '',
      liveImage: '',
      images: [],
      imagePaths: [],
      progress: {
        batchIndex: 0,
        total,
        completed: 0,
        failed: 0,
        partial: 0,
      },
      folder: '',
      error: '',
      completedAt: null,
    };
    conversationHistory.value.push(turn);
    activeConversationId.value = turn.id;
    return turn;
  }

  function activeConversationTurn() {
    return (
      conversationHistory.value.find(
        (turn) => turn.id === activeConversationId.value,
      ) || null
    );
  }

  function updateActiveConversation(updater) {
    const turn = activeConversationTurn();
    if (!turn) return null;
    updater(turn);
    return turn;
  }

  function normalizeConversationTurn(turn = {}) {
    const imagePaths = Array.isArray(turn.imagePaths) ? turn.imagePaths : [];
    const imagesValue = Array.isArray(turn.images) ? turn.images : [];
    const total = Math.max(1, Number(turn.count) || imagePaths.length || 1);
    return {
      id: String(turn.id || `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      createdAt: Number(turn.createdAt) || Date.now(),
      prompt: String(turn.prompt || ''),
      model: String(turn.model || normalizedModel.value),
      ratio: String(turn.ratio || '1:1'),
      resolution: String(turn.resolution || '1024x1024'),
      quality: String(turn.quality || 'auto'),
      outputFormat: String(turn.outputFormat || 'png'),
      count: total,
      referenceCount: Math.max(0, Number(turn.referenceCount) || 0),
      mode: turn.mode === 'batch' ? 'batch' : 'stream',
      status: ['done', 'error', 'cancelled'].includes(turn.status)
        ? turn.status
        : 'done',
      message: String(turn.message || ''),
      liveImage: '',
      images: imagesValue,
      imagePaths,
      progress: {
        batchIndex: Math.max(0, Number(turn.progress?.batchIndex) || 0),
        total: Math.max(0, Number(turn.progress?.total) || total),
        completed: Math.max(
          0,
          Number(turn.progress?.completed) || imagesValue.length,
        ),
        failed: Math.max(0, Number(turn.progress?.failed) || 0),
        partial: Math.max(0, Number(turn.progress?.partial) || 0),
      },
      folder: String(turn.folder || ''),
      error: String(turn.error || ''),
      completedAt: Number(turn.completedAt) || null,
    };
  }

  function serializableConversationTurn(turn = {}) {
    const imagePaths = Array.isArray(turn.imagePaths)
      ? turn.imagePaths.map((itemPath) => String(itemPath || '')).filter(Boolean)
      : [];
    return {
      id: String(turn.id || ''),
      createdAt: Number(turn.createdAt) || Date.now(),
      completedAt: Number(turn.completedAt) || null,
      prompt: String(turn.prompt || ''),
      model: String(turn.model || ''),
      ratio: String(turn.ratio || ''),
      resolution: String(turn.resolution || ''),
      quality: String(turn.quality || ''),
      outputFormat: String(turn.outputFormat || ''),
      count: Math.max(1, Number(turn.count) || imagePaths.length || 1),
      referenceCount: Math.max(0, Number(turn.referenceCount) || 0),
      mode: turn.mode === 'batch' ? 'batch' : 'stream',
      status: ['done', 'error', 'cancelled', 'running'].includes(turn.status)
        ? turn.status
        : 'done',
      message: String(turn.message || ''),
      imagePaths,
      progress: {
        batchIndex: Math.max(0, Number(turn.progress?.batchIndex) || 0),
        total: Math.max(0, Number(turn.progress?.total) || 0),
        completed: Math.max(0, Number(turn.progress?.completed) || imagePaths.length),
        failed: Math.max(0, Number(turn.progress?.failed) || 0),
        partial: Math.max(0, Number(turn.progress?.partial) || 0),
      },
      folder: String(turn.folder || ''),
      error: String(turn.error || ''),
    };
  }

  async function persistConversationTurn(turn = activeConversationTurn()) {
    if (!turn || !window.forge?.saveConversationTurn) return;
    try {
      await window.forge.saveConversationTurn(serializableConversationTurn(turn));
    } catch (error) {
      status.value = formatUserMessage(error, '创作对话保存失败，请稍后重试');
      showToast(status.value, 'error');
    }
  }

  async function loadConversationHistory() {
    if (!window.forge?.listConversationHistory) return;
    try {
      const loaded = await window.forge.listConversationHistory();
      conversationHistory.value = Array.isArray(loaded)
        ? loaded.map(normalizeConversationTurn)
        : [];
      const latestTurn = [...conversationHistory.value]
        .reverse()
        .find((turn) => turn.images.length || turn.imagePaths.length);
      images.value = latestTurn ? [...latestTurn.images] : [];
      imagePaths.value = latestTurn ? [...latestTurn.imagePaths] : [];
    } catch (error) {
      status.value = formatUserMessage(error, '创作对话读取失败，请稍后重试');
      showToast(status.value, 'error');
    }
  }

  function syncConversationImagePaths(oldPath, nextPath) {
    conversationHistory.value.forEach((turn) => {
      if (Array.isArray(turn.imagePaths) && turn.imagePaths.length) {
        turn.imagePaths = turn.imagePaths.map((itemPath) =>
          itemPath === oldPath ? nextPath : itemPath,
        );
      }
    });
  }

  function removeConversationImagePath(filePath) {
    conversationHistory.value.forEach((turn) => {
      const paths = Array.isArray(turn.imagePaths) ? turn.imagePaths : [];
      const turnImages = Array.isArray(turn.images) ? turn.images : [];
      if (!paths.length) return;
      const nextImages = [];
      const nextPaths = [];
      paths.forEach((itemPath, index) => {
        if (itemPath !== filePath) {
          nextPaths.push(itemPath);
          if (turnImages[index]) nextImages.push(turnImages[index]);
        }
      });
      turn.imagePaths = nextPaths;
      turn.images = nextImages;
    });
  }

  function applyGenerationUpdate(update = {}) {
    const { phase } = update;
    if (typeof update.message === 'string') {
      liveMessage.value = update.message;
      status.value = update.message;
      updateActiveConversation((turn) => {
        turn.message = update.message;
      });
    }
    if (typeof update.preview === 'string') {
      liveImage.value = update.preview;
      updateActiveConversation((turn) => {
        turn.liveImage = update.preview;
      });
    }
    if (typeof update.image === 'string') {
      liveImage.value = update.image;
      images.value.push(update.image);
      if (typeof update.localPath === 'string') {
        imagePaths.value.push(update.localPath);
      }
      updateActiveConversation((turn) => {
        turn.liveImage = update.image;
        turn.images = [...images.value];
        turn.imagePaths = [...imagePaths.value];
      });
    }
    if (Array.isArray(update.images) && update.images.length) {
      images.value = update.images;
      updateActiveConversation((turn) => {
        turn.images = [...update.images];
      });
    }
    if (Array.isArray(update.localPaths) && update.localPaths.length) {
      imagePaths.value = update.localPaths;
      updateActiveConversation((turn) => {
        turn.imagePaths = [...update.localPaths];
      });
    }
    if (typeof update.partial === 'number') {
      generationProgress.value.partial = update.partial;
      updateActiveConversation((turn) => {
        turn.progress.partial = update.partial;
      });
    }
    if (typeof update.completed === 'number') {
      generationProgress.value.completed = update.completed;
      updateActiveConversation((turn) => {
        turn.progress.completed = update.completed;
      });
    }
    if (typeof update.failed === 'number') {
      generationProgress.value.failed = update.failed;
      updateActiveConversation((turn) => {
        turn.progress.failed = update.failed;
      });
    }
    if (typeof update.total === 'number') {
      generationProgress.value.total = update.total;
      updateActiveConversation((turn) => {
        turn.progress.total = update.total;
      });
    }
    if (typeof update.batchIndex === 'number') {
      generationProgress.value.batchIndex = update.batchIndex;
      updateActiveConversation((turn) => {
        turn.progress.batchIndex = update.batchIndex;
      });
    }
    if (phase) {
      generationPhase.value = phase;
      if (phase === 'batch-start') {
        generationMode.value = (update.total || 1) > 1 ? 'batch' : 'stream';
        updateActiveConversation((turn) => {
          turn.status = 'running';
          turn.mode = (update.total || 1) > 1 ? 'batch' : 'stream';
        });
      }
      if (phase === 'batch-error') {
        updateActiveConversation((turn) => {
          turn.status = 'error';
          turn.error = update.message || '图片生成失败';
          turn.completedAt = Date.now();
        });
      }
      if (phase === 'done' || phase === 'cancelled') {
        liveMessage.value = update.message || liveMessage.value;
        liveImage.value = '';
        generationMode.value = 'idle';
        updateActiveConversation((turn) => {
          turn.status = phase === 'cancelled' ? 'cancelled' : 'done';
          turn.message = update.message || turn.message;
          turn.liveImage = '';
          turn.completedAt = Date.now();
        });
      }
    }
  }

  function getRequestedSize() {
    return resolution.value !== 'auto'
      ? resolution.value
      : sizeByRatio[ratio.value] || '1024x1024';
  }

  function getGenerationPayload() {
    return {
      endpoint: endpoint.value,
      apiKey: apiKey.value,
      model: model.value,
      prompt: prompt.value,
      aspect: ratio.value,
      size: getRequestedSize(),
      quality: quality.value,
      outputFormat: outputFormat.value,
      count: Math.min(maxCount.value, Math.max(1, Number(count.value) || 1)),
      reference: reference.value.map(({ name, data }) => ({ name, data })),
    };
  }

  async function pickReference() {
    if (reference.value.length >= maxReferences.value) {
      status.value = `${normalizedModel.value} 最多添加 ${maxReferences.value} 张参考图`;
      return;
    }
    const selected = await window.forge.pickImage();
    if (selected) reference.value.push(selected);
  }

  function removeReference(index) {
    reference.value.splice(index, 1);
  }

  function resetSettingsDraft() {
    settingsEndpoint.value = endpoint.value;
    settingsApiKey.value = apiKey.value;
  }

  function saveSettings() {
    endpoint.value = normalizeEndpoint(settingsEndpoint.value);
    apiKey.value = settingsApiKey.value.trim();
    localStorage.setItem(ENDPOINT_STORAGE, endpoint.value);
    localStorage.setItem(API_KEY_STORAGE, apiKey.value);
    status.value = '配置已保存';
    showToast('配置已保存');
  }

  async function handlePaste(event, { view, editorOpen, settingsOpen }) {
    if (view !== 'create' || editorOpen || settingsOpen) return;
    const imageItem = Array.from(event.clipboardData?.items || []).find(
      (item) => item.kind === 'file' && item.type.startsWith('image/'),
    );
    if (!imageItem) return;
    event.preventDefault();
    if (reference.value.length >= maxReferences.value) {
      status.value = `${normalizedModel.value} 最多添加 ${maxReferences.value} 张参考图`;
      return;
    }
    const file = imageItem.getAsFile();
    if (!file) return;
    try {
      reference.value.push({
        name: file.name || `粘贴参考图-${Date.now()}.png`,
        data: await readPastedImage(file),
      });
      status.value = '已粘贴参考图';
      showToast('参考图已添加');
    } catch (error) {
      status.value = formatUserMessage(error, '粘贴参考图失败，请稍后重试');
      showToast(status.value, 'error');
    }
  }

  async function cancelGeneration() {
    if (!window.forge?.cancelGenerate) return;
    try {
      await window.forge.cancelGenerate();
    } catch (error) {
      status.value = formatUserMessage(error, '取消生成失败，请稍后重试');
      showToast(status.value, 'error');
    }
  }

  async function generate() {
    if (!prompt.value.trim()) {
      status.value = '请输入提示词';
      return;
    }
    if (!apiKey.value.trim()) {
      status.value = '请先填写 API Key';
      return;
    }
    if (reference.value.length > maxReferences.value) {
      status.value = `${normalizedModel.value} 最多支持 ${maxReferences.value} 张参考图`;
      return;
    }
    if (!window.forge?.generate) {
      status.value = '应用通信服务不可用，请重启 Loomora';
      return;
    }

    busy.value = true;
    resetGenerationState();
    const total = Math.min(
      maxCount.value,
      Math.max(1, Number(count.value) || 1),
    );
    createConversationTurn(total);
    generationMode.value = total > 1 ? 'batch' : 'stream';
    generationProgress.value.total = total;
    status.value =
      total > 1
        ? `正在抽卡队列中，等待 ${total} 张作品...`
        : '正在生成 1 张图片...';
    updateActiveConversation((turn) => {
      turn.message = status.value;
    });
    try {
      const result = await window.forge.generate(getGenerationPayload());
      if (typeof result?.images?.length === 'number' && result.images.length) {
        images.value = result.images;
      }
      if (typeof result?.localPaths?.length === 'number' && result.localPaths.length) {
        imagePaths.value = result.localPaths;
      }
      updateActiveConversation((turn) => {
        turn.images = [...images.value];
        turn.imagePaths = [...imagePaths.value];
        turn.folder = result.folder || '';
        turn.error = result.error || '';
        turn.liveImage = '';
        turn.progress = {
          ...turn.progress,
          completed: images.value.length,
          failed: result.failedCount || 0,
          total,
        };
      });
      if (!result.ok || result.failedCount) {
        status.value = result.error || '图片生成失败';
        updateActiveConversation((turn) => {
          turn.status = result.cancelled ? 'cancelled' : 'error';
          turn.message = status.value;
          turn.error = status.value;
          turn.completedAt = Date.now();
        });
        await persistConversationTurn();
        showToast(status.value, 'error');
        return;
      }
      status.value = result.folder
        ? `生成完成，作品已保存到 ${result.folder}`
        : '图片生成完成';
      updateActiveConversation((turn) => {
        turn.status = 'done';
        turn.message = status.value;
        turn.completedAt = Date.now();
      });
      await persistConversationTurn();
    } catch (error) {
      status.value = formatUserMessage(error, '图片生成请求发送失败，请稍后重试');
      updateActiveConversation((turn) => {
        turn.status = 'error';
        turn.error = status.value;
        turn.message = status.value;
        turn.completedAt = Date.now();
      });
      await persistConversationTurn();
      showToast(status.value, 'error');
    } finally {
      busy.value = false;
    }
  }

  return {
    prompt,
    ratio,
    count,
    reference,
    conversationHistory,
    images,
    imagePaths,
    liveImage,
    liveMessage,
    generationMode,
    generationPhase,
    generationProgress,
    busy,
    model,
    resolution,
    quality,
    outputFormat,
    settingsEndpoint,
    settingsApiKey,
    modelIsGpt,
    modelIsGemini,
    ratioOptions,
    resolutionOptions,
    qualityOptions: qualityOptionsValue,
    outputFormatOptions,
    maxReferences,
    maxCount,
    promptLimit,
    counter,
    modelOptions,
    resetGenerationState,
    applyGenerationUpdate,
    loadConversationHistory,
    persistConversationTurn,
    syncConversationImagePaths,
    removeConversationImagePath,
    pickReference,
    removeReference,
    resetSettingsDraft,
    saveSettings,
    handlePaste,
    generate,
    cancelGeneration,
  };
}
