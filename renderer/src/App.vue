<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppHeader from './components/AppHeader.vue';
import CreationPanel from './components/CreationPanel.vue';
import ImageContextMenu from './components/ImageContextMenu.vue';
import ImageEditorModal from './components/ImageEditorModal.vue';
import ImageLightbox from './components/ImageLightbox.vue';
import RenameModal from './components/RenameModal.vue';
import OcrDrawer from './components/OcrDrawer.vue';
import SettingsModal from './components/SettingsModal.vue';
import ToastMessage from './components/ToastMessage.vue';
import WorksGallery from './components/WorksGallery.vue';
import { useGenerationForm } from './composables/useGenerationForm';
import { useImageEditor } from './composables/useImageEditor';
import { useOcr } from './composables/useOcr';
import { distributeGalleryItems, sortGalleryItems } from './utils/gallery';
import { formatUserMessage } from './utils/userMessages';

const view = ref('create');
const status = ref('');
const settingsOpen = ref(false);
const toast = ref(null);
const gallery = ref([]);
const galleryLoading = ref(false);
const galleryImporting = ref(false);
const galleryColumnCount = ref(4);
const activeGalleryDate = ref('all');
const gallerySelectionMode = ref(false);
const selectedGalleryPaths = ref([]);
const galleryExporting = ref(false);
const preview = ref(null);
const contextMenu = ref(null);
const renameModal = ref(null);
const scrollContainer = ref(null);
const scrollThumbTop = ref(0);
const scrollThumbHeight = ref(80);
const scrollbarVisible = ref(false);
const editorModal = ref(null);
let toastTimer;
let scrollResizeObserver;
let stopGenerationUpdate;

function showToast(message, type = 'success') {
  clearTimeout(toastTimer);
  toast.value = { message, type };
  toastTimer = setTimeout(() => {
    toast.value = null;
  }, 4000);
}

const form = useGenerationForm({ status, showToast });
const {
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
  qualityOptions,
  outputFormatOptions,
  maxReferences,
  maxCount,
  promptLimit,
  counter,
  modelOptions,
  applyGenerationUpdate,
  loadConversationHistory,
  loadOlderConversations,
  loadNewerConversations,
  syncConversationImagePaths,
  removeConversationImagePath,
  addReferenceFromImage,
  regenerateFromConversation,
} = form;

const ocr = useOcr(showToast);
const currentPreview = computed(
  () => preview.value?.items[preview.value.index],
);
const galleryDateOptions = computed(() => {
  const counts = new Map();
  gallery.value.forEach((item) => {
    const date = String(item.date || '').trim();
    if (!date) return;
    counts.set(date, (counts.get(date) || 0) + 1);
  });
  return Array.from(counts, ([date, count]) => ({ date, count })).sort((a, b) =>
    b.date.localeCompare(a.date),
  );
});
const filteredGallery = computed(() =>
  activeGalleryDate.value === 'all'
    ? gallery.value
    : gallery.value.filter((item) => item.date === activeGalleryDate.value),
);
const galleryColumns = computed(() =>
  distributeGalleryItems(filteredGallery.value, galleryColumnCount.value),
);
const selectedGalleryItems = computed(() =>
  gallery.value.filter((item) => selectedGalleryPaths.value.includes(item.path)),
);
const selectedGalleryCount = computed(() => selectedGalleryItems.value.length);

function closePreview() {
  preview.value = null;
  ocr.close();
}

function editorHost() {
  const host = editorModal.value?.host;
  return host?.value || host;
}

const editor = useImageEditor({
  getHost: editorHost,
  closePreview,
  closeOcr: ocr.close,
  recognize: ocr.recognize,
  gallery,
  sortGalleryItems,
  status,
  showToast,
});

function updateScrollbar() {
  const element = scrollContainer.value;
  if (!element) return;
  scrollbarVisible.value =
    !galleryLoading.value && element.scrollHeight > element.clientHeight + 1;
  if (!scrollbarVisible.value) return;
  const trackHeight = element.clientHeight - 24;
  scrollThumbHeight.value = Math.max(
    48,
    trackHeight * (element.clientHeight / element.scrollHeight),
  );
  const maxTop = trackHeight - scrollThumbHeight.value;
  scrollThumbTop.value =
    element.scrollHeight > element.clientHeight
      ? 12 +
        maxTop *
          (element.scrollTop / (element.scrollHeight - element.clientHeight))
      : 12;
}

function startScrollDrag(event) {
  const element = scrollContainer.value;
  const startY = event.clientY;
  const startScroll = element.scrollTop;
  const available = element.clientHeight - 24 - scrollThumbHeight.value;
  const maxScroll = element.scrollHeight - element.clientHeight;
  const move = (moveEvent) => {
    element.scrollTop =
      startScroll + ((moveEvent.clientY - startY) / available) * maxScroll;
  };
  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
}

function updateGalleryColumnCount() {
  galleryColumnCount.value =
    window.innerWidth <= 850 ? 2 : window.innerWidth <= 1180 ? 3 : 4;
}

function galleryPreviewItems() {
  return filteredGallery.value.map((item) => ({
    src: item.data,
    name: item.name,
    filePath: item.path,
    editable: true,
  }));
}

function generatedPreviewItems() {
  return images.value.map((source, index) => ({
    src: source,
    name: `Generated image ${index + 1}`,
    filePath: imagePaths.value[index],
  }));
}

function conversationPreviewItems(turn) {
  return (turn?.images || []).map((source, index) => ({
    src: source,
    name: `生成图片 ${index + 1}`,
    filePath: turn.imagePaths?.[index],
  }));
}

function clearGallerySelection() {
  gallerySelectionMode.value = false;
  selectedGalleryPaths.value = [];
}

function pruneGallerySelection() {
  selectedGalleryPaths.value = selectedGalleryPaths.value.filter((filePath) =>
    gallery.value.some((item) => item.path === filePath),
  );
}

function toggleGallerySelectionMode() {
  if (gallerySelectionMode.value) {
    clearGallerySelection();
  } else {
    gallerySelectionMode.value = true;
  }
}

function toggleGallerySelection(item) {
  const filePath = item?.path;
  if (!filePath) return;
  if (!gallerySelectionMode.value) gallerySelectionMode.value = true;
  if (selectedGalleryPaths.value.includes(filePath)) {
    selectedGalleryPaths.value = selectedGalleryPaths.value.filter(
      (path) => path !== filePath,
    );
    return;
  }
  selectedGalleryPaths.value = [...selectedGalleryPaths.value, filePath];
}

function selectedGalleryExportItems() {
  return selectedGalleryItems.value.map((item) => ({
    path: item.path,
    name: item.name,
    date: item.date,
  }));
}

async function exportGalleryImages(scope) {
  if (galleryLoading.value || galleryImporting.value || galleryExporting.value) {
    return;
  }
  const items =
    scope === 'selected'
      ? selectedGalleryExportItems()
      : filteredGallery.value.map((item) => ({
          path: item.path,
          name: item.name,
          date: item.date,
        }));
  if (!items.length) {
    status.value =
      scope === 'selected'
        ? '请先勾选要导出的图片'
        : '当前没有可导出的图片';
    showToast(status.value, 'error');
    return;
  }
  galleryExporting.value = true;
  try {
    const result = await window.forge.exportGalleryImages({
      items,
      scope,
      date: activeGalleryDate.value,
    });
    if (result.canceled) return;
    if (result.exported > 0) {
      const detail = result.folder ? `，已保存到 ${result.folder}` : '';
      const exportLabel =
        scope === 'selected'
          ? '勾选图片'
          : activeGalleryDate.value === 'all'
            ? '全部作品'
            : '当前日期作品';
      status.value =
        scope === 'selected'
          ? `已导出 ${result.exported} 张${exportLabel}${detail}`
          : `已导出 ${result.exported} 张${exportLabel}${detail}`;
      if (result.failed?.length) {
        status.value += `，${result.failed.length} 张失败`;
      }
      showToast(status.value, result.failed?.length ? 'error' : 'success');
      clearGallerySelection();
    } else if (result.failed?.length) {
      status.value = `导出失败：${result.failed[0].error}`;
      showToast(status.value, 'error');
    } else {
      status.value = '没有可导出的图片';
      showToast(status.value, 'error');
    }
  } catch (error) {
    status.value = formatUserMessage(error, '批量导出失败，请稍后重试');
    showToast(status.value, 'error');
  } finally {
    galleryExporting.value = false;
  }
}

function openPreview({ type, index = 0, item }) {
  if (type === 'gallery') {
    const galleryIndex = filteredGallery.value.indexOf(item);
    if (galleryIndex < 0) return;
    preview.value = {
      items: galleryPreviewItems(),
      index: galleryIndex,
    };
    return;
  }
  if (type === 'conversation') {
    const turn = conversationHistory.value.find((entry) => entry.id === item);
    const items = conversationPreviewItems(turn);
    if (!items.length) return;
    preview.value = { items, index };
    return;
  }
  preview.value = { items: generatedPreviewItems(), index };
}

function openReferencePreview(index) {
  preview.value = {
    items: reference.value.map((item) => ({
      src: item.data,
      name: item.name,
    })),
    index,
  };
}

function basenameFromPath(filePath) {
  return String(filePath || '').split(/[\\/]/).pop() || '';
}

function syncRenamedImage(oldPath, nextItem) {
  gallery.value = sortGalleryItems(
    gallery.value.map((item) => (item.path === oldPath ? nextItem : item)),
  );
  imagePaths.value = imagePaths.value.map((itemPath) =>
    itemPath === oldPath ? nextItem.path : itemPath,
  );
  syncConversationImagePaths(oldPath, nextItem.path);
  selectedGalleryPaths.value = selectedGalleryPaths.value.map((itemPath) =>
    itemPath === oldPath ? nextItem.path : itemPath,
  );
  if (preview.value?.items?.length) {
    preview.value = {
      ...preview.value,
      items: preview.value.items.map((item) =>
        item.filePath === oldPath
          ? {
              ...item,
              src: nextItem.data || item.src,
              name: nextItem.name || item.name,
              filePath: nextItem.path,
            }
          : item,
      ),
    };
  }
}

function movePreview(step) {
  if (!preview.value?.items.length) return;
  const total = preview.value.items.length;
  preview.value.index = (preview.value.index + step + total) % total;
  ocr.close();
}

async function findGenerationTurnByImage(filePath) {
  if (!filePath || !window.forge?.findConversationByImage) return null;
  try {
    return await window.forge.findConversationByImage(filePath);
  } catch {
    return null;
  }
}

async function showImageMenu(event, source, filePath = '', editable = false) {
  event.preventDefault();
  const generationTurn = await findGenerationTurnByImage(filePath);
  contextMenu.value = {
    x: event.clientX,
    y: event.clientY,
    src: source,
    filePath,
    editable,
    regeneratable: Boolean(generationTurn),
    generationTurn,
  };
}

async function copyContextImage() {
  if (!contextMenu.value) return;
  try {
    await window.forge.copyImage(contextMenu.value.src);
    status.value = '图片已复制';
  } catch (error) {
    status.value = formatUserMessage(error, '复制图片失败，请稍后重试');
  } finally {
    contextMenu.value = null;
  }
}

async function copyConversationPrompt(turn) {
  const text = String(turn?.prompt || '').trim();
  if (!text) return;
  try {
    await window.forge.copyText(text);
    status.value = '提示词已复制';
    showToast(status.value);
  } catch (error) {
    status.value = formatUserMessage(error, '复制提示词失败，请稍后重试');
    showToast(status.value, 'error');
  }
}

function editConversationPrompt(turn) {
  if (!turn?.prompt) return;
  prompt.value = turn.prompt;
  if (turn.model) model.value = turn.model;
  if (turn.ratio) ratio.value = turn.ratio;
  if (turn.resolution) resolution.value = turn.resolution;
  if (turn.quality) quality.value = turn.quality;
  if (turn.outputFormat) outputFormat.value = turn.outputFormat;
  count.value = Math.min(
    maxCount.value,
    Math.max(1, Number(turn.count) || 1),
  );
  view.value = 'create';
  status.value = '已填入历史提示词，可继续编辑';
  showToast(status.value);
}

function syncLatestConversationImages() {
  if (conversationOffset.value !== 0) {
    images.value = [];
    imagePaths.value = [];
    return;
  }
  const latestTurn = [...conversationHistory.value]
    .reverse()
    .find((turn) => turn.images?.length || turn.imagePaths?.length);
  images.value = latestTurn ? [...(latestTurn.images || [])] : [];
  imagePaths.value = latestTurn ? [...(latestTurn.imagePaths || [])] : [];
}

async function deleteConversationRecord(turn) {
  const turnId = String(turn?.id || '').trim();
  if (!turnId) return;
  try {
    if (window.forge?.deleteConversationTurn) {
      await window.forge.deleteConversationTurn(turnId);
    }
    conversationHistory.value = conversationHistory.value.filter(
      (item) => item.id !== turnId,
    );
    conversationTotal.value = Math.max(0, conversationTotal.value - 1);
    if (!conversationHistory.value.length && conversationTotal.value > 0) {
      await loadConversationHistory(
        Math.min(
          conversationOffset.value,
          Math.max(0, conversationTotal.value - conversationLimit.value),
        ),
      );
    } else {
      syncLatestConversationImages();
    }
    status.value = '已删除这轮对话记录，作品图片仍保留在作品库';
    showToast(status.value);
  } catch (error) {
    status.value = formatUserMessage(error, '删除对话记录失败，请稍后重试');
    showToast(status.value, 'error');
  }
}

function useContextImageAsReference() {
  if (!contextMenu.value?.src) return;
  const { src, filePath } = contextMenu.value;
  contextMenu.value = null;
  const added = addReferenceFromImage(
    src,
    basenameFromPath(filePath) || `作品参考图-${Date.now()}.png`,
  );
  if (added) view.value = 'create';
}

async function regenerateContextImage() {
  if (!contextMenu.value?.generationTurn) return;
  const turn = contextMenu.value.generationTurn;
  contextMenu.value = null;
  view.value = 'create';
  await regenerateFromConversation(turn);
}

async function downloadContextImage() {
  if (!contextMenu.value) return;
  const { src, filePath } = contextMenu.value;
  const name = filePath ? filePath.split(/[\\/]/).pop() : '';
  contextMenu.value = null;
  try {
    const result = await window.forge.downloadImage({ src, filePath, name });
    if (result.saved) {
      status.value = `图片已保存到 ${result.path}`;
      showToast(`下载完成：${result.path}`);
    }
  } catch (error) {
    status.value = formatUserMessage(error, '图片下载失败，请稍后重试');
    showToast(status.value, 'error');
  }
}

function recognizeContextText() {
  if (!contextMenu.value) return;
  const { src, filePath } = contextMenu.value;
  contextMenu.value = null;
  ocr.recognize(src, filePath?.split(/[\\/]/).pop() || '图片');
}

function editContextImage() {
  if (!contextMenu.value?.editable) return;
  const item = {
    src: contextMenu.value.src,
    name: basenameFromPath(contextMenu.value.filePath),
    filePath: contextMenu.value.filePath,
    editable: true,
  };
  contextMenu.value = null;
  editor.openEditor(item);
}

function renameContextImage() {
  if (!contextMenu.value?.filePath) return;
  renameModal.value = {
    filePath: contextMenu.value.filePath,
    name: basenameFromPath(contextMenu.value.filePath),
  };
  contextMenu.value = null;
}

async function showContextImageInFolder() {
  if (!contextMenu.value?.filePath) return;
  const filePath = contextMenu.value.filePath;
  contextMenu.value = null;
  try {
    await window.forge.showImageInFolder(filePath);
  } catch (error) {
    status.value = formatUserMessage(error, '无法打开文件所在位置，请稍后重试');
  }
}

async function deleteContextImage() {
  if (!contextMenu.value?.filePath) return;
  const filePath = contextMenu.value.filePath;
  contextMenu.value = null;
  try {
    const result = await window.forge.deleteImage(filePath);
    if (!result.deleted) return;
    const generatedIndex = imagePaths.value.indexOf(filePath);
    if (generatedIndex >= 0) {
      imagePaths.value.splice(generatedIndex, 1);
      images.value.splice(generatedIndex, 1);
    }
    gallery.value = gallery.value.filter((item) => item.path !== filePath);
    selectedGalleryPaths.value = selectedGalleryPaths.value.filter(
      (itemPath) => itemPath !== filePath,
    );
    removeConversationImagePath(filePath);
    closePreview();
    status.value = '图片已删除';
  } catch (error) {
    status.value = formatUserMessage(error, '删除图片失败，请稍后重试');
  }
}

async function saveRenameImage(nameDraft) {
  if (!renameModal.value?.filePath) return;
  const filePath = renameModal.value.filePath;
  const nextName = String(nameDraft || '').trim();
  if (!nextName) {
    status.value = '请输入新的文件名';
    showToast(status.value, 'error');
    return;
  }
  try {
    if (!window.forge?.renameImage) {
      status.value = '重命名服务不可用，请重启 Loomora';
      showToast(status.value, 'error');
      return;
    }
    const result = await window.forge.renameImage({
      filePath,
      name: nextName,
    });
    if (result?.error) {
      status.value = result.error;
      showToast(status.value, 'error');
      return;
    }
    if (result?.renamed) {
      syncRenamedImage(filePath, result.item);
      status.value = '图片已重命名';
      showToast(status.value);
    } else {
      status.value = result?.message || '文件名未变更';
      showToast(status.value);
    }
    renameModal.value = null;
  } catch (error) {
    status.value = formatUserMessage(error, '重命名失败，请检查文件名后重试');
    showToast(status.value, 'error');
  }
}

async function openGallery() {
  view.value = 'gallery';
  clearGallerySelection();
  if (galleryLoading.value) return;
  galleryLoading.value = true;
  scrollbarVisible.value = false;
  if (scrollContainer.value) scrollContainer.value.scrollTop = 0;
  await nextTick();
  try {
    gallery.value = sortGalleryItems(await window.forge.listGallery());
  } catch (error) {
    gallery.value = [];
    status.value = formatUserMessage(error, '作品库加载失败，请稍后重试');
    showToast(status.value, 'error');
  } finally {
    galleryLoading.value = false;
    nextTick(updateScrollbar);
  }
}

async function importGalleryImages(files) {
  if (galleryImporting.value) return;
  galleryImporting.value = true;
  try {
    const result = await window.forge.importGalleryImages(files);
    if (result.canceled) return;
    if (result.items.length) {
      gallery.value = sortGalleryItems([...result.items, ...gallery.value]);
    }
    const importedCount = result.items.length;
    const failedCount = result.failed.length;
    if (!importedCount && failedCount) {
      status.value = `图片导入失败：${result.failed[0].error}`;
      showToast(status.value, 'error');
    } else {
      status.value = failedCount
        ? `成功导入 ${importedCount} 张图片，${failedCount} 张失败`
        : `成功导入 ${importedCount} 张图片`;
      showToast(status.value, failedCount ? 'error' : 'success');
    }
    nextTick(updateScrollbar);
  } catch (error) {
    status.value = formatUserMessage(error, '图片导入失败，请稍后重试');
    showToast(status.value, 'error');
  } finally {
    galleryImporting.value = false;
  }
}

function openSettings() {
  form.resetSettingsDraft();
  settingsOpen.value = true;
}

function saveSettings(endpoint, apiKey) {
  settingsEndpoint.value = endpoint;
  settingsApiKey.value = apiKey;
  form.saveSettings();
  settingsOpen.value = false;
}

function recognizePreview() {
  if (currentPreview.value) {
    ocr.recognize(currentPreview.value.src, currentPreview.value.name);
  }
}

function onPaste(event) {
  form.handlePaste(event, {
    view: view.value,
    editorOpen: editor.open.value,
    settingsOpen: settingsOpen.value,
  });
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    if (renameModal.value) renameModal.value = null;
    else if (settingsOpen.value) settingsOpen.value = false;
    else if (ocr.open.value) ocr.close();
    else if (editor.open.value) editor.close();
    else if (gallerySelectionMode.value) clearGallerySelection();
    else {
      contextMenu.value = null;
      closePreview();
    }
    return;
  }
  if (preview.value && event.key === 'ArrowLeft') movePreview(-1);
  if (preview.value && event.key === 'ArrowRight') movePreview(1);
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('paste', onPaste);
  window.addEventListener('resize', updateScrollbar);
  window.addEventListener('resize', editor.updateOverlay);
  window.addEventListener('resize', updateGalleryColumnCount);
  updateGalleryColumnCount();
  scrollResizeObserver = new ResizeObserver(updateScrollbar);
  scrollResizeObserver.observe(scrollContainer.value);
  scrollResizeObserver.observe(scrollContainer.value.querySelector('main'));
  stopGenerationUpdate = window.forge?.onGenerationUpdate?.((update) => {
    applyGenerationUpdate(update);
  });
  loadConversationHistory();
  nextTick(updateScrollbar);
});

watch(galleryDateOptions, (options) => {
  if (
    activeGalleryDate.value !== 'all' &&
    !options.some((option) => option.date === activeGalleryDate.value)
  ) {
    activeGalleryDate.value = 'all';
  }
});

watch(gallery, pruneGallerySelection);

watch(activeGalleryDate, () => {
  clearGallerySelection();
  if (preview.value) closePreview();
});

watch(view, (nextView) => {
  if (nextView !== 'gallery') clearGallerySelection();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('paste', onPaste);
  window.removeEventListener('resize', updateScrollbar);
  window.removeEventListener('resize', editor.updateOverlay);
  window.removeEventListener('resize', updateGalleryColumnCount);
  scrollResizeObserver?.disconnect();
  stopGenerationUpdate?.();
  editor.destroy();
  clearTimeout(toastTimer);
});
</script>

<template>
  <div class="app-shell" @click="contextMenu = null">
    <div class="window-titlebar" aria-hidden="true"></div>
    <AppHeader
      :active-view="view"
      @create="view = 'create'"
      @gallery="openGallery"
      @settings="openSettings"
    />
    <div
      ref="scrollContainer"
      class="content-scroll"
      @scroll="updateScrollbar"
    >
      <nav
        v-if="view === 'gallery' && gallery.length"
        class="gallery-timeline"
        aria-label="按日期筛选作品库"
      >
        <button
          type="button"
          :class="{ active: activeGalleryDate === 'all' }"
          :aria-pressed="activeGalleryDate === 'all'"
          :title="`全部作品：${gallery.length} 张`"
          @click="activeGalleryDate = 'all'"
        >
          <span>全部</span>
          <b>{{ gallery.length }} 张</b>
        </button>
        <button
          v-for="option in galleryDateOptions"
          :key="option.date"
          type="button"
          :class="{ active: activeGalleryDate === option.date }"
          :aria-pressed="activeGalleryDate === option.date"
          :title="`${option.date}：${option.count} 张`"
          @click="activeGalleryDate = option.date"
        >
          <span>{{ option.date }}</span>
          <b>{{ option.count }} 张</b>
        </button>
      </nav>
      <main>
        <CreationPanel
          v-if="view === 'create'"
          v-model:prompt="prompt"
          v-model:model="model"
          v-model:ratio="ratio"
          v-model:resolution="resolution"
          v-model:quality="quality"
          v-model:output-format="outputFormat"
          v-model:count="count"
          :reference="reference"
          :counter="counter"
          :prompt-limit="promptLimit"
          :model-options="modelOptions"
          :ratio-options="ratioOptions"
          :resolution-options="resolutionOptions"
          :quality-options="qualityOptions"
          :output-format-options="outputFormatOptions"
          :max-references="maxReferences"
          :max-count="maxCount"
          :model-is-gpt="modelIsGpt"
          :model-is-gemini="modelIsGemini"
          :busy="busy"
          @pick-reference="form.pickReference"
          @remove-reference="form.removeReference"
          @preview-reference="openReferencePreview"
          @generate="form.generate"
          @cancel="form.cancelGeneration"
        >
          <template #status>{{ status || '准备就绪' }}</template>
        </CreationPanel>
        <WorksGallery
          :view="view"
          :conversation-history="conversationHistory"
          :conversation-loading="conversationLoading"
          :conversation-offset="conversationOffset"
          :conversation-total="conversationTotal"
          :conversation-limit="conversationLimit"
          :conversation-has-older="conversationHasOlder"
          :conversation-has-newer="conversationHasNewer"
          :images="images"
          :image-paths="imagePaths"
          :live-image="liveImage"
          :live-message="liveMessage"
          :generation-mode="generationMode"
          :live-progress="generationProgress"
          :live-active="busy"
          :gallery="filteredGallery"
          :gallery-columns="galleryColumns"
          :gallery-column-count="galleryColumnCount"
          :gallery-loading="galleryLoading"
          :gallery-importing="galleryImporting"
          :gallery-filter-date="activeGalleryDate"
          :gallery-selection-mode="gallerySelectionMode"
          :gallery-selected-paths="selectedGalleryPaths"
          :gallery-selected-count="selectedGalleryCount"
          :gallery-exporting="galleryExporting"
          @preview="openPreview"
          @context-menu="showImageMenu"
          @load-older-conversations="loadOlderConversations"
          @load-newer-conversations="loadNewerConversations"
          @copy-prompt="copyConversationPrompt"
          @edit-prompt="editConversationPrompt"
          @delete-conversation="deleteConversationRecord"
          @import="importGalleryImages()"
          @import-drop="importGalleryImages"
          @toggle-selection="toggleGallerySelection"
          @toggle-selection-mode="toggleGallerySelectionMode"
          @export-current="exportGalleryImages('current')"
          @export-selected="exportGalleryImages('selected')"
        />
      </main>
      <div v-show="scrollbarVisible" class="custom-scrollbar" aria-hidden="true">
        <div
          class="custom-scrollbar-thumb"
          :style="{
            height: scrollThumbHeight + 'px',
            top: scrollThumbTop + 'px',
          }"
          @pointerdown.prevent="startScrollDrag"
        ></div>
      </div>
    </div>
    <ImageLightbox
      v-if="preview && currentPreview"
      :preview="preview"
      :current-item="currentPreview"
      :ocr-busy="ocr.busy.value"
      @close="closePreview"
      @previous="movePreview(-1)"
      @next="movePreview(1)"
      @recognize="recognizePreview"
      @edit="editor.openEditor(currentPreview)"
      @context-menu="showImageMenu"
    />
    <ImageEditorModal
      ref="editorModal"
      :source="editor.source.value"
      :status="editor.message.value"
      :saving="editor.saving.value"
      :ocr-busy="ocr.busy.value"
      @recognize="editor.recognizeEditorText"
      @close="editor.close()"
      @save="editor.save"
    />
    <ImageContextMenu
      v-if="contextMenu"
      :menu="contextMenu"
      @copy="copyContextImage"
      @reference="useContextImageAsReference"
      @regenerate="regenerateContextImage"
      @download="downloadContextImage"
      @recognize="recognizeContextText"
      @edit="editContextImage"
      @rename="renameContextImage"
      @show-folder="showContextImageInFolder"
      @delete="deleteContextImage"
    />
    <RenameModal
      :open="Boolean(renameModal)"
      :name="renameModal?.name || ''"
      @close="renameModal = null"
      @save="saveRenameImage"
    />
    <OcrDrawer
      :open="ocr.open.value"
      :busy="ocr.busy.value"
      :lines="ocr.lines.value"
      :error="ocr.error.value"
      :source-name="ocr.sourceName.value"
      @close="ocr.close"
      @copy="ocr.copyText"
    />
    <SettingsModal
      :open="settingsOpen"
      :endpoint="settingsEndpoint"
      :api-key="settingsApiKey"
      @close="settingsOpen = false"
      @save="saveSettings"
    />
    <ToastMessage v-if="toast" :toast="toast" @close="toast = null" />
  </div>
</template>
