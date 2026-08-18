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
const CONVERSATION_PAGE_SIZE = 10;
const CONVERSATION_WINDOW_SIZE = CONVERSATION_PAGE_SIZE * 3;

function normalizeEndpoint(value, fallback = DEFAULT_ENDPOINT) {
  const endpoint = String(value || '').trim();
  return legacyOpenAiEndpointPattern.test(endpoint)
    ? OPENAI_API_BASE
    : endpoint || fallback;
}

function readPastedImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('无法读取剪贴板图片'));
    reader.readAsDataURL(file);
  });
}

export function useGenerationForm({
  status,
  showToast,
  onRequireConfiguration,
}) {
  const prompt = ref('');
  const ratio = ref('1:1');
  const count = ref(1);
  const reference = ref([]);
  const conversationHistory = ref([]);
  const conversationLoading = ref(false);
  const conversationOffset = ref(0);
  const conversationTotal = ref(0);
  const conversationLimit = ref(CONVERSATION_PAGE_SIZE);
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
  const generationQueue = ref([]);
  const queuePaused = ref(
    localStorage.getItem('loomora-generation-queue-paused') === 'true',
  );
  const activeQueueTaskId = ref('');
  let queueProcessing = false;
  const endpoint = ref(
    normalizeEndpoint(localStorage.getItem(ENDPOINT_STORAGE)),
  );
  const apiKey = ref('');
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
  const modelIsGpt = computed(
    () => normalizedModel.value === OPENAI_IMAGE_MODEL,
  );
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
  const conversationHasOlder = computed(
    () =>
      conversationOffset.value + conversationHistory.value.length <
      conversationTotal.value,
  );
  const conversationHasNewer = computed(() => conversationOffset.value > 0);
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

  function createConversationTurn(total, request) {
    if (conversationOffset.value !== 0) {
      conversationOffset.value = 0;
      conversationHistory.value = [];
    }
    const turn = {
      id: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      prompt: request.prompt.trim(),
      model: request.model,
      ratio: request.aspect,
      resolution: request.size,
      quality: request.quality,
      outputFormat: request.outputFormat,
      count: total,
      referenceCount: request.reference.length,
      references: request.reference.map(({ name, data }) => ({ name, data })),
      referencePaths: [],
      referenceNames: request.reference.map(({ name }) => name),
      mode: total > 1 ? 'batch' : 'stream',
      status: 'running',
      message: '',
      liveImage: '',
      images: [],
      imagePaths: [],
      imageFavorites: [],
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
    if (conversationHistory.value.length > CONVERSATION_WINDOW_SIZE) {
      conversationHistory.value = conversationHistory.value.slice(
        -CONVERSATION_WINDOW_SIZE,
      );
    }
    conversationTotal.value = Math.max(
      conversationTotal.value + 1,
      conversationHistory.value.length,
    );
    activeConversationId.value = turn.id;
    return turn;
  }

  function reuseConversationTurn(turn, total, request) {
    const target = conversationHistory.value.find(
      (item) => item.id === turn?.id,
    );
    if (!target) return createConversationTurn(total, request);

    Object.assign(target, {
      prompt: request.prompt.trim(),
      model: request.model,
      ratio: request.aspect,
      resolution: request.size,
      quality: request.quality,
      outputFormat: request.outputFormat,
      count: total,
      referenceCount: request.reference.length,
      references: request.reference.map(({ name, data }) => ({ name, data })),
      referencePaths: [],
      referenceNames: request.reference.map(({ name }) => name),
      mode: total > 1 ? 'batch' : 'stream',
      status: 'running',
      message: '',
      liveImage: '',
      images: [],
      imagePaths: [],
      imageFavorites: [],
      progress: {
        batchIndex: 0,
        total,
        completed: 0,
        failed: 0,
        partial: 0,
      },
      error: '',
      completedAt: null,
    });
    activeConversationId.value = target.id;
    return target;
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
    const imageFavorites = Array.isArray(turn.imageFavorites)
      ? turn.imageFavorites
      : [];
    const referencePaths = Array.isArray(turn.referencePaths)
      ? turn.referencePaths.map((item) => String(item || '')).filter(Boolean)
      : [];
    const referenceNames = Array.isArray(turn.referenceNames)
      ? turn.referenceNames.map((item) => String(item || '参考图'))
      : [];
    const total = Math.max(1, Number(turn.count) || imagePaths.length || 1);
    const interrupted = turn.status === 'running';
    return {
      id: String(
        turn.id ||
          `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ),
      createdAt: Number(turn.createdAt) || Date.now(),
      prompt: String(turn.prompt || ''),
      model: String(turn.model || normalizedModel.value),
      ratio: String(turn.ratio || '1:1'),
      resolution: String(turn.resolution || '1024x1024'),
      quality: String(turn.quality || 'auto'),
      outputFormat: String(turn.outputFormat || 'png'),
      count: total,
      referenceCount: Math.max(
        referencePaths.length,
        Number(turn.referenceCount) || 0,
      ),
      references: [],
      referencePaths,
      referenceNames: referencePaths.map(
        (_item, index) => referenceNames[index] || `参考图-${index + 1}`,
      ),
      mode: turn.mode === 'batch' ? 'batch' : 'stream',
      status: interrupted
        ? 'error'
        : ['done', 'error', 'cancelled'].includes(turn.status)
          ? turn.status
          : 'done',
      message: interrupted
        ? '上次生成已中断，可重新生成'
        : String(turn.message || ''),
      liveImage: '',
      images: imagesValue,
      imagePaths,
      imageFavorites: imagePaths.map((_, index) => ({
        favorite: imageFavorites[index]?.favorite === true,
        favoritedAt: imageFavorites[index]?.favoritedAt || null,
      })),
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
      error: interrupted
        ? '上次生成已中断，可重新生成'
        : String(turn.error || ''),
      completedAt: Number(turn.completedAt) || null,
    };
  }

  function serializableConversationTurn(turn = {}) {
    const imagePaths = Array.isArray(turn.imagePaths)
      ? turn.imagePaths
          .map((itemPath) => String(itemPath || ''))
          .filter(Boolean)
      : [];
    const references = Array.isArray(turn.references)
      ? turn.references
          .map(({ name, data }) => ({
            name: String(name || '参考图'),
            data: String(data || ''),
          }))
          .filter((item) => item.data.startsWith('data:image/'))
      : [];
    const referencePaths = Array.isArray(turn.referencePaths)
      ? turn.referencePaths.map((item) => String(item || '')).filter(Boolean)
      : [];
    const referenceNames = Array.isArray(turn.referenceNames)
      ? turn.referenceNames.map((item) => String(item || '参考图'))
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
      referenceCount: Math.max(
        references.length,
        referencePaths.length,
        Number(turn.referenceCount) || 0,
      ),
      references,
      referencePaths,
      referenceNames,
      mode: turn.mode === 'batch' ? 'batch' : 'stream',
      status: ['done', 'error', 'cancelled', 'running'].includes(turn.status)
        ? turn.status
        : 'done',
      message: String(turn.message || ''),
      imagePaths,
      progress: {
        batchIndex: Math.max(0, Number(turn.progress?.batchIndex) || 0),
        total: Math.max(0, Number(turn.progress?.total) || 0),
        completed: Math.max(
          0,
          Number(turn.progress?.completed) || imagePaths.length,
        ),
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
      const result = await window.forge.saveConversationTurn(
        serializableConversationTurn(turn),
      );
      if (result?.turn) {
        turn.referencePaths = [...(result.turn.referencePaths || [])];
        turn.referenceNames = [...(result.turn.referenceNames || [])];
        turn.referenceCount = turn.referencePaths.length;
        if (turn.referencePaths.length) turn.references = [];
      }
    } catch (error) {
      status.value = formatUserMessage(error, '创作对话保存失败，请稍后重试');
      showToast(status.value, 'error');
    }
  }

  function mergeConversationHistory(current, incoming) {
    const turns = new Map();
    for (const turn of [...current, ...incoming]) turns.set(turn.id, turn);
    return Array.from(turns.values()).sort(
      (left, right) => left.createdAt - right.createdAt,
    );
  }

  async function loadConversationHistory(
    offset = conversationOffset.value,
    direction = 'replace',
  ) {
    if (!window.forge?.listConversationHistory) return;
    conversationLoading.value = true;
    try {
      const result = await window.forge.listConversationHistory({
        offset,
        limit: conversationLimit.value,
      });
      const items = Array.isArray(result)
        ? result
        : Array.isArray(result?.items)
          ? result.items
          : [];
      const normalizedItems = items.map(normalizeConversationTurn);
      const resultOffset =
        typeof result?.offset === 'number' ? result.offset : offset;
      if (direction === 'older') {
        let merged = mergeConversationHistory(
          normalizedItems,
          conversationHistory.value,
        );
        const trimmedCount = Math.max(
          0,
          merged.length - CONVERSATION_WINDOW_SIZE,
        );
        if (trimmedCount) merged = merged.slice(0, CONVERSATION_WINDOW_SIZE);
        conversationHistory.value = merged;
        conversationOffset.value += trimmedCount;
      } else if (direction === 'newer') {
        let merged = mergeConversationHistory(
          conversationHistory.value,
          normalizedItems,
        );
        if (merged.length > CONVERSATION_WINDOW_SIZE) {
          merged = merged.slice(-CONVERSATION_WINDOW_SIZE);
        }
        conversationHistory.value = merged;
        conversationOffset.value = resultOffset;
      } else {
        conversationHistory.value = normalizedItems;
        conversationOffset.value = resultOffset;
      }
      conversationTotal.value = Number(result?.total) || items.length;
      conversationLimit.value =
        Number(result?.limit) || conversationLimit.value;
      const latestTurn =
        conversationOffset.value === 0
          ? [...conversationHistory.value]
              .reverse()
              .find((turn) => turn.images.length || turn.imagePaths.length)
          : null;
      images.value = latestTurn ? [...latestTurn.images] : [];
      imagePaths.value = latestTurn ? [...latestTurn.imagePaths] : [];
    } catch (error) {
      status.value = formatUserMessage(error, '创作对话读取失败，请稍后重试');
      showToast(status.value, 'error');
    } finally {
      conversationLoading.value = false;
    }
  }

  function loadOlderConversations() {
    if (conversationLoading.value || !conversationHasOlder.value) return;
    return loadConversationHistory(
      conversationOffset.value + conversationHistory.value.length,
      'older',
    );
  }

  function loadNewerConversations() {
    if (conversationLoading.value || !conversationHasNewer.value) return;
    return loadConversationHistory(
      Math.max(0, conversationOffset.value - conversationLimit.value),
      'newer',
    );
  }

  function loadLatestConversations() {
    if (conversationLoading.value || conversationOffset.value === 0) return;
    return loadConversationHistory(0);
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
      turn.progress = {
        ...turn.progress,
        completed: Math.min(
          Number(turn.progress?.completed) || nextPaths.length,
          nextPaths.length,
        ),
      };
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
        if (typeof update.preview === 'string') {
          turn.liveImage = update.preview;
        }
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
          const failed =
            phase !== 'cancelled' &&
            (turn.status === 'error' ||
              update.ok === false ||
              Number(update.failed) > 0);
          turn.status =
            phase === 'cancelled' ? 'cancelled' : failed ? 'error' : 'done';
          turn.message = update.message || turn.message;
          if (failed)
            turn.error = update.message || turn.error || '图片生成失败';
          turn.liveImage = '';
          turn.completedAt = Date.now();
        });
      }
    }
  }

  function getGenerationPayload(overrides = {}) {
    const requestRatio = String(overrides.aspect || ratio.value || '1:1');
    const requestSize =
      overrides.size ||
      (resolution.value !== 'auto'
        ? resolution.value
        : sizeByRatio[requestRatio] || '1024x1024');
    const requestReference = Array.isArray(overrides.reference)
      ? overrides.reference
      : reference.value;
    return {
      endpoint: String(overrides.endpoint || endpoint.value),
      apiKey: String(overrides.apiKey || apiKey.value),
      model: String(overrides.model || model.value),
      prompt: String(overrides.prompt ?? prompt.value),
      aspect: requestRatio,
      size: String(requestSize),
      quality: String(overrides.quality || quality.value || 'auto'),
      outputFormat: String(
        overrides.outputFormat || outputFormat.value || 'png',
      ),
      count: Math.min(
        maxCount.value,
        Math.max(1, Number(overrides.count ?? count.value) || 1),
      ),
      reference: requestReference.map(({ name, data }) => ({ name, data })),
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

  function addReferenceFromImage(data, name = '作品参考图.png') {
    if (reference.value.length >= maxReferences.value) {
      status.value = `${normalizedModel.value} 最多添加 ${maxReferences.value} 张参考图`;
      showToast(status.value, 'error');
      return false;
    }
    const source = String(data || '');
    if (!source.startsWith('data:image/')) {
      status.value = '图片数据无效，无法作为参考图';
      showToast(status.value, 'error');
      return false;
    }
    reference.value.push({
      name: String(name || '作品参考图.png'),
      data: source,
    });
    status.value = '已添加为参考图，可以继续创作';
    showToast(status.value);
    return true;
  }

  async function regenerateFromConversation(turn = {}, options = {}) {
    if (!turn.prompt) {
      status.value = '未找到可重新生成的提示词';
      showToast(status.value, 'error');
      return;
    }
    const requestedCount = Number(options.count) || Number(turn.count) || 1;
    const historicalRatio = String(turn.ratio || ratio.value || '1:1');
    const historicalReferences = await loadConversationReferences(turn);
    return generate({
      onStart: options.onStart,
      reuseTurn: options.reuseTurn ? turn : null,
      request: {
        model: String(turn.model || model.value),
        prompt: String(turn.prompt),
        aspect: historicalRatio,
        size:
          turn.resolution && turn.resolution !== 'auto'
            ? String(turn.resolution)
            : sizeByRatio[historicalRatio] || '1024x1024',
        quality: String(turn.quality || 'auto'),
        outputFormat: String(turn.outputFormat || 'png'),
        count: Math.min(maxCount.value, Math.max(1, requestedCount)),
        reference: historicalReferences,
      },
    });
  }

  async function loadConversationReferences(turn = {}) {
    const inMemory = Array.isArray(turn.references)
      ? turn.references.filter((item) =>
          String(item?.data || '').startsWith('data:image/'),
        )
      : [];
    if (inMemory.length) {
      return inMemory.map(({ name, data }) => ({
        name: String(name || '参考图'),
        data: String(data),
      }));
    }

    const paths = Array.isArray(turn.referencePaths) ? turn.referencePaths : [];
    const names = Array.isArray(turn.referenceNames) ? turn.referenceNames : [];
    const restored = [];
    let missing = 0;
    for (let index = 0; index < paths.length; index++) {
      try {
        const data = await window.forge.readGalleryImage(paths[index]);
        restored.push({
          name: String(names[index] || `参考图-${index + 1}`),
          data,
        });
      } catch {
        missing += 1;
      }
    }
    if (missing || (!paths.length && Number(turn.referenceCount) > 0)) {
      showToast(
        restored.length
          ? `已恢复 ${restored.length} 张参考图，另有 ${missing} 张文件已丢失`
          : '这条历史记录的参考图未保存或文件已丢失',
        'error',
      );
    }
    return restored;
  }

  function removeReference(index) {
    reference.value.splice(index, 1);
  }

  function resetSettingsDraft() {
    settingsEndpoint.value = endpoint.value;
    settingsApiKey.value = apiKey.value;
  }

  async function hydrateSecureApiKey() {
    const legacyApiKey = localStorage.getItem(API_KEY_STORAGE) || '';
    try {
      if (legacyApiKey && window.forge?.setSecureApiKey) {
        await window.forge.setSecureApiKey(legacyApiKey);
        localStorage.removeItem(API_KEY_STORAGE);
      }
      apiKey.value = window.forge?.getSecureApiKey
        ? await window.forge.getSecureApiKey()
        : '';
      settingsApiKey.value = apiKey.value;
      await loadGenerationQueue();
      processGenerationQueue();
    } catch (error) {
      localStorage.removeItem(API_KEY_STORAGE);
      status.value = formatUserMessage(error, 'API Key 读取失败，请重新填写');
      showToast(status.value, 'error');
    }
  }

  async function saveSettings() {
    // 保存时保留空地址，生成入口才能及时识别“未配置”状态。
    endpoint.value = normalizeEndpoint(settingsEndpoint.value, '');
    apiKey.value = settingsApiKey.value.trim();
    if (endpoint.value) localStorage.setItem(ENDPOINT_STORAGE, endpoint.value);
    else localStorage.removeItem(ENDPOINT_STORAGE);
    localStorage.removeItem(API_KEY_STORAGE);
    if (window.forge?.setSecureApiKey) {
      await window.forge.setSecureApiKey(apiKey.value);
    }
    status.value = '配置已保存';
    showToast('配置已保存');
    processGenerationQueue();
  }

  function clearLocalSettings() {
    localStorage.removeItem(ENDPOINT_STORAGE);
    localStorage.removeItem(API_KEY_STORAGE);
    endpoint.value = DEFAULT_ENDPOINT;
    apiKey.value = '';
    settingsEndpoint.value = DEFAULT_ENDPOINT;
    settingsApiKey.value = '';
    prompt.value = '';
    reference.value = [];
    conversationHistory.value = [];
    conversationOffset.value = 0;
    conversationTotal.value = 0;
    activeConversationId.value = '';
    generationQueue.value = [];
    activeQueueTaskId.value = '';
    resetGenerationState();
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

  async function executeQueuedGeneration(request) {
    busy.value = true;
    resetGenerationState();
    const total = request.count;
    createConversationTurn(total, request);
    generationMode.value = total > 1 ? 'batch' : 'stream';
    generationProgress.value.total = total;
    status.value =
      total > 1
        ? `正在抽卡队列中，等待 ${total} 张作品...`
        : '正在生成 1 张图片...';
    updateActiveConversation((turn) => {
      turn.message = status.value;
    });
    await persistConversationTurn();
    try {
      const result = await window.forge.generate(request);
      if (typeof result?.images?.length === 'number' && result.images.length) {
        images.value = result.images;
      }
      if (
        typeof result?.localPaths?.length === 'number' &&
        result.localPaths.length
      ) {
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
        return false;
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
      return true;
    } catch (error) {
      status.value = formatUserMessage(
        error,
        '图片生成请求发送失败，请稍后重试',
      );
      updateActiveConversation((turn) => {
        turn.status = 'error';
        turn.error = status.value;
        turn.message = status.value;
        turn.completedAt = Date.now();
      });
      await persistConversationTurn();
      showToast(status.value, 'error');
      return false;
    } finally {
      busy.value = false;
    }
  }

  async function loadGenerationQueue() {
    if (!window.forge?.listGenerationQueue) return;
    try {
      generationQueue.value = await window.forge.listGenerationQueue();
    } catch (error) {
      showToast(
        formatUserMessage(error, '生成队列读取失败，请稍后重试'),
        'error',
      );
    }
  }

  async function setQueueTaskStatus(id, statusValue, error = '') {
    const updated = await window.forge.updateGenerationQueueTask({
      id,
      status: statusValue,
      error,
    });
    const index = generationQueue.value.findIndex((item) => item.id === id);
    if (index >= 0) generationQueue.value[index] = updated;
    else generationQueue.value.push(updated);
  }

  async function processGenerationQueue() {
    if (
      queueProcessing ||
      queuePaused.value ||
      !apiKey.value.trim() ||
      !window.forge?.getGenerationQueueTask
    ) {
      return;
    }
    queueProcessing = true;
    try {
      let nextTask = generationQueue.value.find(
        (item) => item.status === 'pending',
      );
      while (nextTask && !queuePaused.value) {
        activeQueueTaskId.value = nextTask.id;
        await setQueueTaskStatus(nextTask.id, 'running');
        let succeeded = false;
        let taskError = '';
        try {
          const task = await window.forge.getGenerationQueueTask(nextTask.id);
          if (!String(task.request?.endpoint || '').trim()) {
            taskError = '请先填写接口地址';
            await setQueueTaskStatus(nextTask.id, 'failed', taskError);
            activeQueueTaskId.value = '';
            nextTask = generationQueue.value.find(
              (item) => item.status === 'pending',
            );
            continue;
          }
          succeeded = await executeQueuedGeneration({
            ...task.request,
            apiKey: apiKey.value,
          });
          if (!succeeded) taskError = status.value || '图片生成失败';
        } catch (error) {
          taskError = formatUserMessage(error, '图片生成请求发送失败');
        }
        await setQueueTaskStatus(
          nextTask.id,
          succeeded ? 'done' : 'failed',
          taskError,
        );
        activeQueueTaskId.value = '';
        nextTask = generationQueue.value.find(
          (item) => item.status === 'pending',
        );
      }
    } finally {
      activeQueueTaskId.value = '';
      queueProcessing = false;
    }
  }

  async function generate({ onStart, request: requestOverrides = {} } = {}) {
    const request = getGenerationPayload(requestOverrides);
    if (!request.prompt.trim()) {
      status.value = '请输入提示词';
      return;
    }
    const missingConfiguration = [];
    if (!request.endpoint.trim()) missingConfiguration.push('接口地址');
    if (!request.apiKey.trim()) missingConfiguration.push('API Key');
    if (missingConfiguration.length) {
      status.value = `请先配置${missingConfiguration.join('和')}`;
      showToast(status.value, 'error');
      onRequireConfiguration?.();
      return;
    }
    if (request.reference.length > maxReferences.value) {
      status.value = `${normalizedModel.value} 最多支持 ${maxReferences.value} 张参考图`;
      showToast(status.value, 'error');
      return;
    }
    if (!window.forge?.enqueueGenerationTask) {
      status.value = '生成队列服务不可用，请重启 Loomora';
      showToast(status.value, 'error');
      return;
    }
    try {
      const { apiKey: _apiKey, ...persistedRequest } = request;
      const task = await window.forge.enqueueGenerationTask(persistedRequest);
      generationQueue.value.push(task);
      onStart?.();
      status.value = busy.value
        ? `已加入生成队列，前方还有 ${generationQueue.value.filter((item) => item.status === 'pending').length - 1} 个任务`
        : '已加入生成队列';
      showToast(status.value);
      processGenerationQueue();
      return task;
    } catch (error) {
      status.value = formatUserMessage(error, '加入生成队列失败，请稍后重试');
      showToast(status.value, 'error');
    }
  }

  function toggleQueuePause() {
    queuePaused.value = !queuePaused.value;
    localStorage.setItem(
      'loomora-generation-queue-paused',
      String(queuePaused.value),
    );
    if (!queuePaused.value) processGenerationQueue();
  }

  async function retryGenerationTask(task) {
    if (!task?.id || task.status !== 'failed') return;
    await setQueueTaskStatus(task.id, 'pending');
    processGenerationQueue();
  }

  async function removeGenerationTask(task) {
    if (!task?.id || task.id === activeQueueTaskId.value) return;
    await window.forge.removeGenerationQueueTask(task.id);
    generationQueue.value = generationQueue.value.filter(
      (item) => item.id !== task.id,
    );
  }

  async function clearFinishedGenerationTasks() {
    await window.forge.clearFinishedGenerationTasks();
    generationQueue.value = generationQueue.value.filter(
      (item) => !['done', 'failed'].includes(item.status),
    );
  }

  return {
    prompt,
    ratio,
    count,
    reference,
    conversationHistory,
    conversationLoading,
    conversationOffset,
    conversationTotal,
    conversationLimit,
    conversationHasOlder,
    conversationHasNewer,
    images,
    imagePaths,
    liveImage,
    liveMessage,
    generationMode,
    generationPhase,
    generationProgress,
    busy,
    generationQueue,
    queuePaused,
    activeQueueTaskId,
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
    loadOlderConversations,
    loadNewerConversations,
    loadLatestConversations,
    persistConversationTurn,
    syncConversationImagePaths,
    removeConversationImagePath,
    addReferenceFromImage,
    loadConversationReferences,
    regenerateFromConversation,
    pickReference,
    removeReference,
    resetSettingsDraft,
    hydrateSecureApiKey,
    loadGenerationQueue,
    toggleQueuePause,
    retryGenerationTask,
    removeGenerationTask,
    clearFinishedGenerationTasks,
    saveSettings,
    clearLocalSettings,
    handlePaste,
    generate,
    cancelGeneration,
  };
}
