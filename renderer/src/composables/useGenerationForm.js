import { computed, ref, watch } from 'vue';
import {
  API_KEY_STORAGE,
  DEFAULT_PROMPT_LIMIT,
  DEFAULT_ENDPOINT,
  ENDPOINT_STORAGE,
  geminiRatios,
  gptRatios,
  gptSizes,
  grokRatios,
  modelAliases,
  modelOptions,
  promptLimits,
} from '../config/imageModels';

const qualityByProvider = {
  gpt: [
    { value: 'auto', label: '自动' },
    { value: 'low', label: '低' },
    { value: 'medium', label: '中' },
    { value: 'high', label: '高' },
  ],
  gemini: [
    { value: '1K', label: '1K' },
    { value: '2K', label: '2K' },
    { value: '4K', label: '4K' },
  ],
};

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
  const ratio = ref('16:9');
  const count = ref(1);
  const reference = ref([]);
  const images = ref([]);
  const imagePaths = ref([]);
  const busy = ref(false);
  const endpoint = ref(
    localStorage.getItem(ENDPOINT_STORAGE) || DEFAULT_ENDPOINT,
  );
  const apiKey = ref(localStorage.getItem(API_KEY_STORAGE) || '');
  const model = ref('gpt-image-2');
  const resolution = ref('auto');
  const quality = ref('auto');
  const settingsEndpoint = ref(endpoint.value);
  const settingsApiKey = ref(apiKey.value);

  const normalizedModel = computed(() => {
    const value = model.value.trim();
    return modelAliases[value] || value;
  });
  const modelIsGpt = computed(() => normalizedModel.value === 'gpt-image-2');
  const modelIsGemini = computed(() =>
    normalizedModel.value.startsWith('gemini-'),
  );
  const activeRatios = computed(() => {
    if (modelIsGpt.value) return gptRatios;
    if (modelIsGemini.value) return geminiRatios;
    return grokRatios;
  });
  const ratioOptions = computed(() =>
    activeRatios.value.map((value) => ({ value, label: value })),
  );
  const resolutionOptions = computed(() =>
    modelIsGpt.value ? gptSizes : ratioOptions.value,
  );
  const qualityOptions = computed(() => {
    if (modelIsGpt.value) return qualityByProvider.gpt;
    if (modelIsGemini.value) return qualityByProvider.gemini;
    return [];
  });
  const maxReferences = computed(() => {
    if (modelIsGpt.value) return 14;
    if (modelIsGemini.value) return 4;
    if (normalizedModel.value === 'grok-imagine-image-edit') return 3;
    if (normalizedModel.value === 'grok-imagine-image-lite') return 0;
    if (normalizedModel.value.startsWith('grok-imagine-image')) return 1;
    return 14;
  });
  const maxCount = computed(
    () =>
      modelOptions.find((option) => option.value === normalizedModel.value)
        ?.maxCount || 1,
  );
  const promptLimit = computed(
    () => promptLimits[model.value.trim()] || DEFAULT_PROMPT_LIMIT,
  );
  const counter = computed(() => `${prompt.value.length}/${promptLimit.value}`);

  watch(model, () => {
    if (modelIsGpt.value) {
      ratio.value = '16:9';
      resolution.value = 'auto';
      quality.value = 'auto';
    } else if (modelIsGemini.value) {
      ratio.value = '1:1';
      resolution.value = '1:1';
      quality.value = '2K';
    } else {
      ratio.value = '1:1';
      resolution.value = '1:1';
      quality.value = 'auto';
    }
    count.value = Math.min(count.value, maxCount.value);
    if (reference.value.length > maxReferences.value) {
      status.value = `${normalizedModel.value} 最多支持 ${maxReferences.value} 张参考图`;
    }
  });
  watch(ratio, (value) => {
    if (!modelIsGpt.value) resolution.value = value;
  });

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
    endpoint.value = settingsEndpoint.value.trim() || DEFAULT_ENDPOINT;
    apiKey.value = settingsApiKey.value.trim();
    localStorage.setItem(API_KEY_STORAGE, apiKey.value);
    localStorage.setItem(ENDPOINT_STORAGE, endpoint.value);
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
      status.value = error?.message || '粘贴参考图失败';
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
    const total = Math.min(
      maxCount.value,
      Math.max(1, Number(count.value) || 1),
    );
    status.value = `正在生成 ${total} 张图片...`;
    try {
      const result = await window.forge.generate({
        endpoint: endpoint.value,
        apiKey: apiKey.value,
        model: model.value,
        prompt: prompt.value,
        aspect: ratio.value,
        size: resolution.value,
        quality: quality.value,
        count: total,
        reference: reference.value.map(({ name, data }) => ({ name, data })),
      });
      images.value = result.images || [];
      imagePaths.value = result.localPaths || [];
      if (!result.ok || result.failedCount) {
        status.value = result.error || '图片生成失败';
        showToast(status.value, 'error');
        return;
      }
      status.value = result.folder
        ? `生成完成，作品已保存到 ${result.folder}`
        : '图片生成完成';
    } catch (error) {
      status.value = error?.message || '图片生成请求发送失败';
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
    images,
    imagePaths,
    busy,
    model,
    resolution,
    quality,
    settingsEndpoint,
    settingsApiKey,
    modelIsGpt,
    modelIsGemini,
    ratioOptions,
    resolutionOptions,
    qualityOptions,
    maxReferences,
    maxCount,
    promptLimit,
    counter,
    modelOptions,
    pickReference,
    removeReference,
    resetSettingsDraft,
    saveSettings,
    handlePaste,
    generate,
  };
}
