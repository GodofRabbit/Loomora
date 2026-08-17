<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import { CalendarDays, Images } from 'lucide-vue-next';
import AboutModal from './components/AboutModal.vue';
import AppHeader from './components/AppHeader.vue';
import ConfirmModal from './components/ConfirmModal.vue';
import CreationPanel from './components/CreationPanel.vue';
import ImageContextMenu from './components/ImageContextMenu.vue';
import ImageEditorModal from './components/ImageEditorModal.vue';
import ImageLightbox from './components/ImageLightbox.vue';
import InspirationSquare from './components/InspirationSquare.vue';
import RenameModal from './components/RenameModal.vue';
import OcrDrawer from './components/OcrDrawer.vue';
import OnboardingModal from './components/OnboardingModal.vue';
import SettingsModal from './components/SettingsModal.vue';
import ToastMessage from './components/ToastMessage.vue';
import WorksGallery from './components/WorksGallery.vue';
import { useGenerationForm } from './composables/useGenerationForm';
import { useImageEditor } from './composables/useImageEditor';
import { useOcr } from './composables/useOcr';
import { distributeGalleryItems, sortGalleryItems } from './utils/gallery';
import { formatUserMessage } from './utils/userMessages';

const view = ref('create');
const runtimePlatform = window.forge?.platform || '';
const isMacPlatform =
  runtimePlatform === 'darwin' || /Mac/i.test(navigator.platform || '');
const galleryVisited = ref(false);
const inspirationVisited = ref(false);
const status = ref('');
const creationStatus = ref('');
const settingsOpen = ref(false);
const settingsSaving = ref(false);
const aboutOpen = ref(false);
const onboardingOpen = ref(false);
const galleryDirectory = ref('');
const defaultGalleryDirectory = ref('');
const appInfo = ref({
  name: 'Loomora',
  version: '1.0.0',
  author: '伟大的兔神',
  email: 'believe_rl@163.com',
});
const toast = ref(null);
const gallery = ref([]);
const galleryLoaded = ref(false);
const galleryLoading = ref(false);
const galleryImporting = ref(false);
const galleryColumnCount = ref(5);
const activeGalleryDate = ref('all');
const gallerySearch = ref('');
const gallerySelectionMode = ref(false);
const selectedGalleryPaths = ref([]);
const galleryExporting = ref(false);
const galleryDeleting = ref(false);
const conversationDeleting = ref(false);
const deleteConfirmation = ref(null);
const preview = ref(null);
const contextMenu = ref(null);
const renameModal = ref(null);
const scrollContainer = ref(null);
const creationGallery = ref(null);
const scrollThumbTop = ref(0);
const scrollThumbHeight = ref(80);
const scrollbarVisible = ref(false);
const editorModal = ref(null);
const composerCollapseSignal = ref(0);
const composerExpandSignal = ref(0);
const composerRevealSignal = ref(0);
const conversationAwayFromBottom = ref(false);
const conversationScrollBottomSignal = ref(0);
const conversationFollowBottomSignal = ref(0);
const creationHistoryVisible = ref(false);
let toastTimer;
let scrollResizeObserver;
let stopGenerationUpdate;
let lastComposerCollapseAt = 0;
let composerCollapseLockUntil = 0;
let composerCollapseRequested = false;
let viewRestoreFrame;
let restoringViewScroll = false;
let startupIdleTimer;
let conversationScrollSnapshot = null;
let creationComposerRestoreTimer;
const viewScrollPositions = {
  create: 0,
  gallery: 0,
  inspiration: 0,
};

function showToast(message, type = 'success', targetView = view.value) {
  clearTimeout(toastTimer);
  toast.value = { message, type, view: targetView };
  toastTimer = setTimeout(() => {
    toast.value = null;
  }, 4000);
}

const showCreationToast = (message, type = 'success') =>
  showToast(message, type, 'create');
const showGalleryToast = (message, type = 'success') =>
  showToast(message, type, 'gallery');

const form = useGenerationForm({
  status: creationStatus,
  showToast: showCreationToast,
});
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
  loadLatestConversations,
  syncConversationImagePaths,
  removeConversationImagePath,
  addReferenceFromImage,
  loadConversationReferences,
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
const filteredGallery = computed(() => {
  const query = gallerySearch.value.trim().toLowerCase();
  return gallery.value.filter((item) => {
    const matchesDate =
      activeGalleryDate.value === 'all' ||
      item.date === activeGalleryDate.value;
    const matchesSearch =
      !query ||
      `${item.name || ''} ${item.date || ''}`.toLowerCase().includes(query);
    return matchesDate && matchesSearch;
  });
});
const galleryColumns = computed(() =>
  distributeGalleryItems(filteredGallery.value, galleryColumnCount.value),
);
const selectedGalleryItems = computed(() =>
  gallery.value.filter((item) =>
    selectedGalleryPaths.value.includes(item.path),
  ),
);
const selectedGalleryCount = computed(() => selectedGalleryItems.value.length);
const deleteConfirmationBusy = computed(() =>
  deleteConfirmation.value?.mode === 'conversation'
    ? conversationDeleting.value
    : galleryDeleting.value,
);
const createStartMode = computed(
  () =>
    view.value === 'create' &&
    (!creationHistoryVisible.value || conversationTotal.value === 0) &&
    !busy.value,
);
const visibleConversationHistory = computed(() =>
  createStartMode.value ? [] : conversationHistory.value,
);

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

function requestComposerCollapse(options = {}) {
  const force = options?.force === true;
  if (view.value !== 'create') return;
  if (!force && !conversationAwayFromBottom.value) return;
  const now = Date.now();
  if (!force && now < composerCollapseLockUntil) return;
  if (composerCollapseRequested) return;
  if (!force && now - lastComposerCollapseAt < 120) return;
  lastComposerCollapseAt = now;
  composerCollapseRequested = true;
  composerCollapseSignal.value += 1;
}

function handleComposerFocusChange(focused) {
  if (focused) composerCollapseRequested = false;
}

function restoreCreationConversationAfterLayout(snapshot, duration = 620) {
  if (!snapshot) return;
  window.clearTimeout(creationComposerRestoreTimer);
  nextTick(() => {
    if (view.value !== 'create') return;
    creationGallery.value?.restoreConversationScrollSnapshot?.(snapshot, {
      duration,
    });
    creationComposerRestoreTimer = window.setTimeout(
      () => {
        if (view.value !== 'create') return;
        creationGallery.value?.restoreConversationScrollSnapshot?.(snapshot, {
          duration: 220,
        });
      },
      Math.max(260, duration - 160),
    );
  });
}

function handleContentScroll() {
  if (
    !restoringViewScroll &&
    view.value in viewScrollPositions &&
    scrollContainer.value
  ) {
    viewScrollPositions[view.value] = scrollContainer.value.scrollTop;
  }
  updateScrollbar();
  requestComposerCollapse();
}

function updateConversationScrollState(state) {
  const nextAwayFromBottom =
    typeof state === 'object' ? Boolean(state?.awayFromBottom) : Boolean(state);
  const userScrolledTowardBottom =
    typeof state === 'object' && Boolean(state?.userScrolledTowardBottom);
  if (
    nextAwayFromBottom &&
    view.value === 'create' &&
    !conversationAwayFromBottom.value &&
    Date.now() < composerCollapseLockUntil
  ) {
    return;
  }
  conversationAwayFromBottom.value = nextAwayFromBottom;
  if (nextAwayFromBottom) {
    return;
  }
  if (view.value === 'create' && composerCollapseRequested) {
    composerCollapseRequested = false;
    if (userScrolledTowardBottom) {
      composerCollapseLockUntil = Date.now() + 820;
      composerRevealSignal.value += 1;
      nextTick(() => {
        window.requestAnimationFrame(() => {
          conversationFollowBottomSignal.value += 1;
        });
      });
    }
  }
}

function scrollConversationToBottom() {
  composerCollapseRequested = false;
  composerCollapseLockUntil = Date.now() + 820;
  conversationScrollBottomSignal.value += 1;
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
  const windowWidth = window.innerWidth;
  const galleryWidth =
    windowWidth > 1180
      ? Math.min(1248, windowWidth - 192)
      : Math.max(0, windowWidth - 32);
  galleryColumnCount.value = Math.max(
    2,
    Math.min(5, Math.floor((galleryWidth + 16) / 236)),
  );
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

function removeGalleryImagePathsFromState(filePaths) {
  const deletedPaths = [...new Set(filePaths.filter(Boolean))];
  if (!deletedPaths.length) return;
  const deletedSet = new Set(deletedPaths);
  const previousImagePaths = [...imagePaths.value];
  imagePaths.value = previousImagePaths.filter(
    (itemPath) => !deletedSet.has(itemPath),
  );
  images.value = images.value.filter(
    (_image, index) => !deletedSet.has(previousImagePaths[index]),
  );
  gallery.value = gallery.value.filter((item) => !deletedSet.has(item.path));
  selectedGalleryPaths.value = selectedGalleryPaths.value.filter(
    (itemPath) => !deletedSet.has(itemPath),
  );
  deletedPaths.forEach(removeConversationImagePath);
  if (preview.value?.items?.some((item) => deletedSet.has(item.filePath))) {
    closePreview();
  }
}

async function exportGalleryImages(scope) {
  if (
    galleryLoading.value ||
    galleryImporting.value ||
    galleryExporting.value ||
    galleryDeleting.value
  ) {
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
      scope === 'selected' ? '请先勾选要导出的图片' : '当前没有可导出的图片';
    showGalleryToast(status.value, 'error');
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
      showGalleryToast(
        status.value,
        result.failed?.length ? 'error' : 'success',
      );
      clearGallerySelection();
    } else if (result.failed?.length) {
      status.value = `导出失败：${result.failed[0].error}`;
      showGalleryToast(status.value, 'error');
    } else {
      status.value = '没有可导出的图片';
      showGalleryToast(status.value, 'error');
    }
  } catch (error) {
    status.value = formatUserMessage(error, '批量导出失败，请稍后重试');
    showGalleryToast(status.value, 'error');
  } finally {
    galleryExporting.value = false;
  }
}

function deleteSelectedGalleryImages() {
  if (
    galleryLoading.value ||
    galleryImporting.value ||
    galleryExporting.value ||
    galleryDeleting.value
  ) {
    return;
  }
  const filePaths = selectedGalleryItems.value.map((item) => item.path);
  if (!filePaths.length) {
    status.value = '请先勾选要删除的图片';
    showGalleryToast(status.value, 'error');
    return;
  }
  deleteConfirmation.value = {
    mode: 'batch',
    targetView: 'gallery',
    filePaths,
    title: '删除已选图片',
    message: `确定要永久删除选中的 ${filePaths.length} 张本地图片吗？`,
    detail: '删除后无法恢复，创作记录中的图片引用也会同步移除。',
  };
}

function clearAllGalleryImages() {
  if (
    galleryLoading.value ||
    galleryImporting.value ||
    galleryExporting.value ||
    galleryDeleting.value ||
    !gallery.value.length
  ) {
    return;
  }
  const filePaths = gallery.value.map((item) => item.path).filter(Boolean);
  deleteConfirmation.value = {
    mode: 'all',
    targetView: 'gallery',
    filePaths,
    title: '清空全部作品',
    message: `确定要永久删除作品库中的 ${filePaths.length} 张图片吗？`,
    detail:
      '此操作不受当前日期或搜索筛选影响，删除后无法恢复。创作记录中的图片引用也会同步移除。',
  };
}

async function confirmDeleteImages() {
  const request = deleteConfirmation.value;
  if (!request || galleryDeleting.value) return;
  const filePaths = Array.isArray(request.filePaths)
    ? request.filePaths
        .map((filePath) => String(filePath || ''))
        .filter(Boolean)
    : [];
  const showDeleteToast = (message, type = 'success') =>
    showToast(message, type, request.targetView || 'gallery');
  if (!filePaths.length) {
    status.value = '没有找到可删除的本地图片';
    showDeleteToast(status.value, 'error');
    deleteConfirmation.value = null;
    return;
  }
  if (!window.forge?.deleteGalleryImages) {
    status.value = '删除服务不可用，请重启 Loomora';
    showDeleteToast(status.value, 'error');
    return;
  }
  galleryDeleting.value = true;
  try {
    const result = (await window.forge.deleteGalleryImages(filePaths)) || {};
    const removedPaths = Array.isArray(result.removedPaths)
      ? result.removedPaths
      : Array.isArray(result.deletedPaths)
        ? result.deletedPaths
        : [];
    const deletedPaths = Array.isArray(result.deletedPaths)
      ? result.deletedPaths
      : [];
    const missingCount = Array.isArray(result.missingPaths)
      ? result.missingPaths.length
      : 0;
    removeGalleryImagePathsFromState(removedPaths);
    const failedCount = Array.isArray(result.failed) ? result.failed.length : 0;
    const historySyncError = String(result.historySyncError || '').trim();
    if (removedPaths.length) {
      if (request.mode === 'single') {
        status.value = deletedPaths.length
          ? '图片已永久删除'
          : '图片文件已不存在，已从作品库移除';
      } else if (request.mode === 'all') {
        status.value = `作品库已清空，共移除 ${removedPaths.length} 张图片`;
      } else {
        status.value = `已移除 ${removedPaths.length} 张本地图片`;
      }
      if (missingCount && deletedPaths.length) {
        status.value += `，其中 ${missingCount} 张文件此前已不存在`;
      }
      if (failedCount) status.value += `，${failedCount} 张删除失败`;
      if (historySyncError) status.value += `，${historySyncError}`;
      showDeleteToast(
        status.value,
        failedCount || historySyncError ? 'error' : 'success',
      );
      if (request.mode !== 'single' && !failedCount) clearGallerySelection();
    } else if (failedCount) {
      status.value = `删除失败：${result.failed[0].error}`;
      showDeleteToast(status.value, 'error');
    } else {
      status.value = '删除未完成，未找到对应的本地图片';
      showDeleteToast(status.value, 'error');
    }
    deleteConfirmation.value = null;
    nextTick(updateScrollbar);
  } catch (error) {
    status.value = formatUserMessage(
      error,
      request.mode === 'single'
        ? '删除图片失败，请稍后重试'
        : '批量删除图片失败，请稍后重试',
    );
    showDeleteToast(status.value, 'error');
  } finally {
    galleryDeleting.value = false;
  }
}

function openPreview({ type, index = 0, item, items = [] }) {
  if (type === 'gallery') {
    const galleryIndex = filteredGallery.value.indexOf(item);
    if (galleryIndex < 0) return;
    preview.value = {
      items: galleryPreviewItems(),
      index: galleryIndex,
    };
    return;
  }
  if (type === 'direct') {
    if (!items.length) return;
    preview.value = { items, index };
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
  return (
    String(filePath || '')
      .split(/[\\/]/)
      .pop() || ''
  );
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
  const targetView = view.value;
  const generationTurn = await findGenerationTurnByImage(filePath);
  contextMenu.value = {
    x: event.clientX,
    y: event.clientY,
    src: source,
    filePath,
    editable,
    regeneratable: Boolean(generationTurn),
    generationTurn,
    targetView,
  };
}

async function copyContextImage() {
  if (!contextMenu.value) return;
  try {
    await window.forge.copyImage(
      contextMenu.value.src,
      contextMenu.value.filePath,
    );
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
    creationStatus.value = '提示词已复制';
    showCreationToast(creationStatus.value);
  } catch (error) {
    creationStatus.value = formatUserMessage(
      error,
      '复制提示词失败，请稍后重试',
    );
    showCreationToast(creationStatus.value, 'error');
  }
}

async function editConversationPrompt(turn) {
  if (!turn?.prompt) return;
  prompt.value = turn.prompt;
  if (turn.model) model.value = turn.model;
  if (turn.ratio) ratio.value = turn.ratio;
  if (turn.resolution) resolution.value = turn.resolution;
  if (turn.quality) quality.value = turn.quality;
  if (turn.outputFormat) outputFormat.value = turn.outputFormat;
  count.value = Math.min(maxCount.value, Math.max(1, Number(turn.count) || 1));
  creationHistoryVisible.value = true;
  await openCreateComposerExpanded();
  const restoredReferences = await loadConversationReferences(turn);
  reference.value = restoredReferences.slice(0, maxReferences.value);
  creationStatus.value = '已填入历史提示词，可继续编辑';
  showCreationToast(creationStatus.value);
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

function requestDeleteConversation(turn) {
  const turnId = String(turn?.id || '').trim();
  if (!turnId || conversationDeleting.value) return;
  const promptText = String(turn?.prompt || '').trim();
  deleteConfirmation.value = {
    mode: 'conversation',
    targetView: 'create',
    turnId,
    title: '删除对话记录',
    message: '确定要删除这一轮创作对话吗？',
    detail: promptText
      ? `${promptText.slice(0, 72)}${promptText.length > 72 ? '...' : ''}\n只删除对话记录，已保存到作品库的图片不会被删除。`
      : '只删除对话记录，已保存到作品库的图片不会被删除。',
  };
}

async function deleteConversationRecord(turnId) {
  const targetId = String(turnId || '').trim();
  if (!targetId) return false;
  try {
    if (!window.forge?.deleteConversationTurn) {
      throw new Error('对话记录删除服务不可用，请重启 Loomora');
    }
    const result = await window.forge.deleteConversationTurn(targetId);
    if (!result?.deleted) throw new Error('未找到这条对话记录');
    conversationHistory.value = conversationHistory.value.filter(
      (item) => item.id !== targetId,
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
    creationStatus.value = '已删除这轮对话记录，作品图片仍保留在作品库';
    showCreationToast(creationStatus.value);
    return true;
  } catch (error) {
    creationStatus.value = formatUserMessage(
      error,
      '删除对话记录失败，请稍后重试',
    );
    showCreationToast(creationStatus.value, 'error');
    return false;
  }
}

async function confirmDeleteRequest() {
  const request = deleteConfirmation.value;
  if (!request) return;
  if (request.mode !== 'conversation') {
    await confirmDeleteImages();
    return;
  }
  if (conversationDeleting.value) return;
  conversationDeleting.value = true;
  try {
    if (await deleteConversationRecord(request.turnId)) {
      deleteConfirmation.value = null;
    }
  } finally {
    conversationDeleting.value = false;
  }
}

async function useContextImageAsReference() {
  if (!contextMenu.value?.src) return;
  const { src, filePath } = contextMenu.value;
  contextMenu.value = null;
  creationStatus.value = '正在读取参考图...';
  try {
    const source = src.startsWith('data:image/')
      ? src
      : await window.forge.readGalleryImage(filePath);
    const added = addReferenceFromImage(
      source,
      basenameFromPath(filePath) || `作品参考图-${Date.now()}.png`,
    );
    if (added) await openCreateComposerExpanded();
  } catch (error) {
    creationStatus.value = formatUserMessage(
      error,
      '参考图读取失败，请稍后重试',
    );
    showCreationToast(creationStatus.value, 'error');
  }
}

async function openCreateComposerExpanded(options = {}) {
  const preserveConversationScroll =
    options.preserveConversationScroll ?? view.value !== 'create';
  const snapshot = preserveConversationScroll
    ? conversationScrollSnapshot
    : null;
  composerCollapseRequested = false;
  composerCollapseLockUntil = Date.now() + 900;
  view.value = 'create';
  await nextTick();
  if (!createStartMode.value) composerExpandSignal.value += 1;
  if (preserveConversationScroll) {
    restoreCreationConversationAfterLayout(snapshot);
  }
}

async function useConversationImageAsReference(turn) {
  const images = Array.isArray(turn?.images) ? turn.images : [];
  const imagePaths = Array.isArray(turn?.imagePaths) ? turn.imagePaths : [];
  const candidates = Array.from(
    { length: Math.max(images.length, imagePaths.length) },
    (_, index) => ({
      source: String(images[index] || ''),
      filePath: String(imagePaths[index] || ''),
      index,
    }),
  ).filter((item) => item.source || item.filePath);
  if (!candidates.length) return;

  const remaining = Math.max(0, maxReferences.value - reference.value.length);
  if (!remaining) {
    creationStatus.value = `当前模型最多添加 ${maxReferences.value} 张参考图`;
    showCreationToast(creationStatus.value, 'error');
    return;
  }

  creationStatus.value = '正在读取参考图...';
  try {
    const prepared = [];
    for (const item of candidates.slice(0, remaining)) {
      const data = item.source.startsWith('data:image/')
        ? item.source
        : await window.forge.readGalleryImage(item.filePath);
      if (!String(data || '').startsWith('data:image/')) continue;
      prepared.push({
        data,
        name:
          basenameFromPath(item.filePath) || `生成参考图-${item.index + 1}.png`,
      });
    }
    if (!prepared.length) throw new Error('未找到可用的生成图片');

    reference.value.push(...prepared);
    const limited = candidates.length > remaining;
    creationStatus.value = `已添加 ${prepared.length} 张参考图${
      limited ? `，已达到 ${maxReferences.value} 张上限` : '，可以继续创作'
    }`;
    showCreationToast(creationStatus.value);
    view.value = 'create';
  } catch (error) {
    creationStatus.value = formatUserMessage(
      error,
      '参考图读取失败，请稍后重试',
    );
    showCreationToast(creationStatus.value, 'error');
  }
}

async function regenerateContextImage() {
  if (!contextMenu.value?.generationTurn) return;
  const turn = contextMenu.value.generationTurn;
  contextMenu.value = null;
  view.value = 'create';
  creationHistoryVisible.value = true;
  await regenerateFromConversation(turn, {
    count: 1,
    onStart: showRegenerationWait,
  });
}

async function regenerateConversationTurn(turn) {
  if (!turn?.prompt) return;
  view.value = 'create';
  creationHistoryVisible.value = true;
  await regenerateFromConversation(turn, {
    onStart: showRegenerationWait,
    reuseTurn: turn.status === 'error',
  });
}

function showRegenerationWait() {
  conversationAwayFromBottom.value = false;
  composerCollapseRequested = true;
  composerCollapseLockUntil = Date.now() + 820;
  composerCollapseSignal.value += 1;
  nextTick(() => {
    conversationScrollBottomSignal.value += 1;
  });
}

function showCreationHistory() {
  creationHistoryVisible.value = true;
  nextTick(() => {
    conversationScrollBottomSignal.value += 1;
  });
}

function returnToCreationStart() {
  view.value = 'create';
  creationHistoryVisible.value = false;
  conversationAwayFromBottom.value = false;
  composerCollapseRequested = false;
  contextMenu.value = null;
  composerCollapseLockUntil = Date.now() + 520;
  nextTick(() => {
    if (scrollContainer.value) scrollContainer.value.scrollTop = 0;
    updateScrollbar();
  });
}

async function generateFromComposer() {
  await form.generate({
    onStart: () => {
      creationHistoryVisible.value = true;
    },
  });
}

function svgDataUrlToPng(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width || 1024;
      canvas.height = image.naturalHeight || image.height || 1024;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('无法处理灵感图片'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => reject(new Error('灵感图片数据无效'));
    image.src = dataUrl;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('无法读取灵感图片'));
    reader.readAsDataURL(blob);
  });
}

async function localAssetToDataUrl(source) {
  if (/^https?:\/\//i.test(source)) {
    throw new Error('灵感广场不使用外部网络图片地址');
  }
  const response = await fetch(source);
  if (!response.ok) throw new Error('本地灵感图片读取失败');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('灵感图片数据无效');
  return {
    data: await blobToDataUrl(blob),
    extension:
      blob.type === 'image/png'
        ? 'png'
        : blob.type === 'image/webp'
          ? 'webp'
          : 'jpg',
  };
}

async function normalizeInspirationImageData(value) {
  const source = String(value || '');
  if (!source.startsWith('data:image/')) {
    return localAssetToDataUrl(source);
  }
  if (source.startsWith('data:image/svg+xml')) {
    return { data: await svgDataUrlToPng(source), extension: 'png' };
  }
  const extension = source.startsWith('data:image/webp')
    ? 'webp'
    : source.startsWith('data:image/png')
      ? 'png'
      : 'jpg';
  return { data: source, extension };
}

async function useInspirationPrompt(item) {
  if (!item?.prompt) return;
  prompt.value = item.prompt;
  if (item.ratio) ratio.value = item.ratio;
  if (item.resolution) resolution.value = item.resolution;
  count.value = 1;
  await openCreateComposerExpanded();
  creationStatus.value = '已填入灵感提示词，可继续调整后生成';
  showCreationToast(creationStatus.value);
}

async function useInspirationReference(item) {
  if (!item?.image) return;
  creationStatus.value = '正在准备灵感参考图...';
  try {
    const result = await normalizeInspirationImageData(item.image);
    const added = addReferenceFromImage(
      result?.data,
      `${item.title || '灵感参考图'}.${result.extension}`,
    );
    if (!added) return;
    await openCreateComposerExpanded();
  } catch (error) {
    creationStatus.value = formatUserMessage(
      error,
      '灵感参考图准备失败，请稍后重试',
    );
    showCreationToast(creationStatus.value, 'error');
  }
}

async function openConversationFolder(turn) {
  const folder = String(turn?.folder || '').trim();
  const imagePath = String(turn?.imagePaths?.[0] || '').trim();
  if (!folder && !imagePath) return;
  try {
    if (imagePath && window.forge?.showImageInFolder) {
      await window.forge.showImageInFolder(imagePath);
    } else if (window.forge?.openFolder) {
      await window.forge.openFolder(folder);
    }
  } catch (error) {
    try {
      if (folder && window.forge?.openFolder) {
        await window.forge.openFolder(folder);
        return;
      }
    } catch {
      // Fall through to the user-facing error below.
    }
    creationStatus.value = formatUserMessage(
      error,
      '无法打开图片所在位置，请稍后重试',
    );
    showCreationToast(creationStatus.value, 'error');
  }
}

async function downloadContextImage() {
  if (!contextMenu.value) return;
  const { src, filePath, targetView } = contextMenu.value;
  const name = filePath ? filePath.split(/[\\/]/).pop() : '';
  contextMenu.value = null;
  try {
    const result = await window.forge.downloadImage({ src, filePath, name });
    if (result.saved) {
      status.value = `图片已保存到 ${result.path}`;
      showToast(`下载完成：${result.path}`, 'success', targetView);
    }
  } catch (error) {
    status.value = formatUserMessage(error, '图片下载失败，请稍后重试');
    showToast(status.value, 'error', targetView);
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
    targetView: contextMenu.value.targetView,
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

function deleteContextImage() {
  if (!contextMenu.value?.filePath) return;
  const filePath = contextMenu.value.filePath;
  const targetView = contextMenu.value.targetView || view.value;
  const fileName = basenameFromPath(filePath) || '当前图片';
  contextMenu.value = null;
  deleteConfirmation.value = {
    mode: 'single',
    targetView,
    filePaths: [filePath],
    title: '删除图片',
    message: '确定要永久删除这张本地图片吗？',
    detail: `${fileName}\n删除后无法恢复，创作记录中的图片引用也会同步移除。`,
  };
}

async function saveRenameImage(nameDraft) {
  if (!renameModal.value?.filePath) return;
  const filePath = renameModal.value.filePath;
  const targetView = renameModal.value.targetView || view.value;
  const nextName = String(nameDraft || '').trim();
  if (!nextName) {
    status.value = '请输入新的文件名';
    showToast(status.value, 'error', targetView);
    return;
  }
  try {
    if (!window.forge?.renameImage) {
      status.value = '重命名服务不可用，请重启 Loomora';
      showToast(status.value, 'error', targetView);
      return;
    }
    const result = await window.forge.renameImage({
      filePath,
      name: nextName,
    });
    if (result?.error) {
      status.value = result.error;
      showToast(status.value, 'error', targetView);
      return;
    }
    if (result?.renamed) {
      syncRenamedImage(filePath, result.item);
      status.value = '图片已重命名';
      showToast(status.value, 'success', targetView);
    } else {
      status.value = result?.message || '文件名未变更';
      showToast(status.value, 'success', targetView);
    }
    renameModal.value = null;
  } catch (error) {
    status.value = formatUserMessage(error, '重命名失败，请检查文件名后重试');
    showToast(status.value, 'error', targetView);
  }
}

async function openGallery() {
  galleryVisited.value = true;
  view.value = 'gallery';
  if (galleryLoaded.value) {
    await nextTick();
    updateScrollbar();
    return;
  }
  if (galleryLoading.value) return;
  galleryLoading.value = true;
  await nextTick();
  try {
    gallery.value = sortGalleryItems(await window.forge.listGallery());
    galleryLoaded.value = true;
  } catch (error) {
    galleryLoaded.value = false;
    status.value = formatUserMessage(error, '作品库加载失败，请稍后重试');
    showGalleryToast(status.value, 'error');
  } finally {
    galleryLoading.value = false;
    nextTick(updateScrollbar);
  }
}

async function openInspiration() {
  inspirationVisited.value = true;
  view.value = 'inspiration';
  await nextTick(updateScrollbar);
}

async function importGalleryImages(files) {
  if (galleryImporting.value || galleryDeleting.value) return;
  galleryImporting.value = true;
  try {
    const result = await window.forge.importGalleryImages(files);
    if (result.canceled) return;
    if (result.items.length) {
      gallery.value = sortGalleryItems([...result.items, ...gallery.value]);
      galleryLoaded.value = true;
    }
    const importedCount = result.items.length;
    const failedCount = result.failed.length;
    if (!importedCount && failedCount) {
      status.value = `图片导入失败：${result.failed[0].error}`;
      showGalleryToast(status.value, 'error');
    } else {
      status.value = failedCount
        ? `成功导入 ${importedCount} 张图片，${failedCount} 张失败`
        : `成功导入 ${importedCount} 张图片`;
      showGalleryToast(status.value, failedCount ? 'error' : 'success');
    }
    nextTick(updateScrollbar);
  } catch (error) {
    status.value = formatUserMessage(error, '图片导入失败，请稍后重试');
    showGalleryToast(status.value, 'error');
  } finally {
    galleryImporting.value = false;
  }
}

async function loadGalleryStorageSettings() {
  if (!window.forge?.getGalleryStorage) return;
  const result = await window.forge.getGalleryStorage();
  galleryDirectory.value = String(result?.directory || '');
  defaultGalleryDirectory.value = String(result?.defaultDirectory || '');
}

async function openSettings() {
  form.resetSettingsDraft();
  try {
    await loadGalleryStorageSettings();
  } catch (error) {
    showToast(
      formatUserMessage(error, '读取本地存储设置失败，请稍后重试'),
      'error',
    );
  }
  settingsOpen.value = true;
}

async function saveSettings(endpoint, apiKey, storagePath) {
  if (settingsSaving.value) return;
  settingsSaving.value = true;
  const previousDirectory = galleryDirectory.value;
  try {
    const storage = await window.forge.setGalleryStorage(
      storagePath === defaultGalleryDirectory.value ? '' : storagePath,
    );
    galleryDirectory.value = String(storage?.directory || storagePath || '');
    defaultGalleryDirectory.value = String(
      storage?.defaultDirectory || defaultGalleryDirectory.value,
    );
    settingsEndpoint.value = endpoint;
    settingsApiKey.value = apiKey;
    form.saveSettings();
    settingsOpen.value = false;

    if (galleryDirectory.value !== previousDirectory) {
      galleryLoaded.value = false;
      await loadConversationHistory(0, 'replace');
      if (galleryVisited.value) {
        gallery.value = sortGalleryItems(await window.forge.listGallery());
        galleryLoaded.value = true;
      }
      showToast('保存位置已更新，原目录中的作品仍会继续显示');
    } else {
      showToast('设置已保存');
    }
  } catch (error) {
    showToast(formatUserMessage(error, '保存设置失败，请稍后重试'), 'error');
  } finally {
    settingsSaving.value = false;
  }
}

async function copyAuthorEmail() {
  try {
    await window.forge.copyText(appInfo.value.email);
    showToast('作者邮箱已复制');
  } catch (error) {
    showToast(formatUserMessage(error, '复制邮箱失败，请稍后重试'), 'error');
  }
}

function finishOnboarding() {
  Promise.resolve(window.forge?.setOnboardingComplete?.()).catch(() => {});
  onboardingOpen.value = false;
}

async function loadOnboardingState() {
  try {
    const completed = await window.forge?.getOnboardingComplete?.();
    if (completed === true) {
      onboardingOpen.value = false;
      return;
    }

    onboardingOpen.value = true;
    await nextTick();
    // Mark the first-run guide as seen immediately, so force-quitting the app
    // cannot make it appear again on every subsequent launch.
    await window.forge?.setOnboardingComplete?.();
  } catch {
    onboardingOpen.value = true;
  }
}

function showOnboardingFromAbout() {
  aboutOpen.value = false;
  returnToCreationStart();
  nextTick(() => {
    onboardingOpen.value = true;
  });
}

function recognizePreview() {
  if (currentPreview.value) {
    ocr.recognize(currentPreview.value.src, currentPreview.value.name);
  }
}

function onPaste(event) {
  if (aboutOpen.value || onboardingOpen.value) return;
  form.handlePaste(event, {
    view: view.value,
    editorOpen: editor.open.value,
    settingsOpen: settingsOpen.value,
  });
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    if (onboardingOpen.value || aboutOpen.value) return;
    if (deleteConfirmation.value) return;
    if (renameModal.value) renameModal.value = null;
    else if (settingsOpen.value) settingsOpen.value = false;
    else if (ocr.open.value) ocr.close();
    else if (editor.open.value) editor.close();
    else if (view.value === 'gallery' && gallerySelectionMode.value) {
      clearGallerySelection();
    } else {
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
  window.forge
    ?.getAppInfo?.()
    .then((result) => {
      if (result) appInfo.value = { ...appInfo.value, ...result };
    })
    .catch(() => {});
  loadOnboardingState();
  nextTick(updateScrollbar);
  const runDeferredStartup = () => {
    loadConversationHistory();
    loadGalleryStorageSettings().catch(() => {});
  };
  if ('requestIdleCallback' in window) {
    startupIdleTimer = window.requestIdleCallback(runDeferredStartup, {
      timeout: 1200,
    });
  } else {
    startupIdleTimer = window.setTimeout(runDeferredStartup, 120);
  }
});

onBeforeUnmount(() => {
  if (startupIdleTimer == null) return;
  if ('cancelIdleCallback' in window) {
    window.cancelIdleCallback(startupIdleTimer);
  } else {
    window.clearTimeout(startupIdleTimer);
  }
  startupIdleTimer = undefined;
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

watch(
  () => imagePaths.value.slice(),
  (nextPaths, previousPaths) => {
    if (!galleryLoaded.value) return;
    const previous = new Set(previousPaths);
    const hasUnsyncedImage = nextPaths.some(
      (filePath) =>
        filePath &&
        !previous.has(filePath) &&
        !gallery.value.some((item) => item.path === filePath),
    );
    if (hasUnsyncedImage) galleryLoaded.value = false;
  },
);

watch(activeGalleryDate, () => {
  clearGallerySelection();
  if (preview.value) closePreview();
});

watch(view, (nextView, previousView) => {
  const element = scrollContainer.value;
  if (previousView === 'create') {
    conversationScrollSnapshot =
      creationGallery.value?.captureConversationScrollSnapshot?.() ||
      conversationScrollSnapshot;
  }
  if (element && previousView in viewScrollPositions) {
    viewScrollPositions[previousView] = element.scrollTop;
  }
  if (nextView === 'gallery') galleryVisited.value = true;
  if (nextView === 'inspiration') inspirationVisited.value = true;
  restoringViewScroll = true;
  window.cancelAnimationFrame(viewRestoreFrame);
  nextTick(() => {
    viewRestoreFrame = window.requestAnimationFrame(() => {
      const scrollElement = scrollContainer.value;
      if (!scrollElement || view.value !== nextView) {
        restoringViewScroll = false;
        return;
      }
      scrollElement.scrollTop = viewScrollPositions[nextView] || 0;
      if (nextView === 'create' && conversationScrollSnapshot) {
        creationGallery.value?.restoreConversationScrollSnapshot?.(
          conversationScrollSnapshot,
        );
      }
      updateScrollbar();
      restoringViewScroll = false;
    });
  });
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
  window.clearTimeout(creationComposerRestoreTimer);
  window.cancelAnimationFrame(viewRestoreFrame);
});
</script>

<template>
  <div
    class="app-shell"
    :class="{
      'create-view': view === 'create',
      'create-start-view': createStartMode,
      'platform-macos': isMacPlatform,
      'gallery-view': view === 'gallery',
      'inspiration-view': view === 'inspiration',
    }"
    @click="contextMenu = null"
  >
    <div class="window-titlebar" aria-hidden="true"></div>
    <AppHeader
      :active-view="view"
      @home="returnToCreationStart"
      @create="view = 'create'"
      @gallery="openGallery"
      @inspiration="openInspiration"
      @settings="openSettings"
      @about="aboutOpen = true"
    />
    <div
      ref="scrollContainer"
      class="content-scroll"
      @scroll="handleContentScroll"
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
          <Images class="gallery-timeline-icon" aria-hidden="true" />
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
          <CalendarDays class="gallery-timeline-icon" aria-hidden="true" />
          <span>{{ option.date }}</span>
          <b>{{ option.count }} 张</b>
        </button>
      </nav>
      <main>
        <KeepAlive>
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
            :start-mode="createStartMode"
            :show-bottom-button="
              view === 'create' &&
              !createStartMode &&
              conversationAwayFromBottom
            "
            :collapse-signal="composerCollapseSignal"
            :expand-signal="composerExpandSignal"
            :reveal-signal="composerRevealSignal"
            @pick-reference="form.pickReference"
            @remove-reference="form.removeReference"
            @preview-reference="openReferencePreview"
            @generate="generateFromComposer"
            @cancel="form.cancelGeneration"
            @scroll-bottom="scrollConversationToBottom"
            @composer-focus-change="handleComposerFocusChange"
          >
            <template #before-card>
              <WorksGallery
                ref="creationGallery"
                view="create"
                :active="view === 'create'"
                :conversation-history="visibleConversationHistory"
                :conversation-loading="conversationLoading"
                :conversation-offset="conversationOffset"
                :conversation-total="conversationTotal"
                :conversation-start-mode="createStartMode"
                :conversation-has-older="conversationHasOlder"
                :conversation-has-newer="conversationHasNewer"
                :scroll-bottom-signal="conversationScrollBottomSignal"
                :follow-bottom-signal="conversationFollowBottomSignal"
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
                :gallery-search="gallerySearch"
                :gallery-selection-mode="gallerySelectionMode"
                :gallery-selected-paths="selectedGalleryPaths"
                :gallery-selected-count="selectedGalleryCount"
                :gallery-exporting="galleryExporting"
                :gallery-deleting="galleryDeleting"
                @preview="openPreview"
                @context-menu="showImageMenu"
                @load-older-conversations="loadOlderConversations"
                @load-newer-conversations="loadNewerConversations"
                @load-latest-conversations="loadLatestConversations"
                @show-conversation-history="showCreationHistory"
                @copy-prompt="copyConversationPrompt"
                @edit-prompt="editConversationPrompt"
                @delete-conversation="requestDeleteConversation"
                @regenerate-conversation="regenerateConversationTurn"
                @reference-conversation-image="useConversationImageAsReference"
                @open-conversation-folder="openConversationFolder"
                @conversation-scroll="requestComposerCollapse"
                @conversation-scroll-state="updateConversationScrollState"
                @import="importGalleryImages()"
                @import-drop="importGalleryImages"
                @toggle-selection="toggleGallerySelection"
                @toggle-selection-mode="toggleGallerySelectionMode"
                @export-current="exportGalleryImages('current')"
                @export-selected="exportGalleryImages('selected')"
                @clear-all="clearAllGalleryImages"
                @delete-selected="deleteSelectedGalleryImages"
                @update-gallery-search="gallerySearch = $event"
              />
            </template>
          </CreationPanel>
        </KeepAlive>
        <WorksGallery
          v-if="galleryVisited"
          v-show="view === 'gallery'"
          view="gallery"
          :active="view === 'gallery'"
          :conversation-history="conversationHistory"
          :conversation-loading="conversationLoading"
          :conversation-offset="conversationOffset"
          :conversation-total="conversationTotal"
          :conversation-has-older="conversationHasOlder"
          :conversation-has-newer="conversationHasNewer"
          :scroll-bottom-signal="conversationScrollBottomSignal"
          :images="images"
          :image-paths="imagePaths"
          :live-image="liveImage"
          :live-message="liveMessage"
          :generation-mode="generationMode"
          :live-progress="generationProgress"
          :live-active="busy"
          :gallery="filteredGallery"
          :gallery-total="gallery.length"
          :gallery-columns="galleryColumns"
          :gallery-column-count="galleryColumnCount"
          :gallery-loading="galleryLoading"
          :gallery-importing="galleryImporting"
          :gallery-filter-date="activeGalleryDate"
          :gallery-search="gallerySearch"
          :gallery-selection-mode="gallerySelectionMode"
          :gallery-selected-paths="selectedGalleryPaths"
          :gallery-selected-count="selectedGalleryCount"
          :gallery-exporting="galleryExporting"
          :gallery-deleting="galleryDeleting"
          @preview="openPreview"
          @context-menu="showImageMenu"
          @load-older-conversations="loadOlderConversations"
          @load-newer-conversations="loadNewerConversations"
          @load-latest-conversations="loadLatestConversations"
          @copy-prompt="copyConversationPrompt"
          @edit-prompt="editConversationPrompt"
          @delete-conversation="requestDeleteConversation"
          @regenerate-conversation="regenerateConversationTurn"
          @open-conversation-folder="openConversationFolder"
          @conversation-scroll="requestComposerCollapse"
          @conversation-scroll-state="updateConversationScrollState"
          @import="importGalleryImages()"
          @import-drop="importGalleryImages"
          @toggle-selection="toggleGallerySelection"
          @toggle-selection-mode="toggleGallerySelectionMode"
          @export-current="exportGalleryImages('current')"
          @export-selected="exportGalleryImages('selected')"
          @clear-all="clearAllGalleryImages"
          @delete-selected="deleteSelectedGalleryImages"
          @update-gallery-search="gallerySearch = $event"
        />
        <InspirationSquare
          v-if="inspirationVisited"
          v-show="view === 'inspiration'"
          :column-count="galleryColumnCount"
          @use-prompt="useInspirationPrompt"
          @use-reference="useInspirationReference"
          @preview="openPreview"
        />
      </main>
      <div
        v-show="scrollbarVisible"
        class="custom-scrollbar"
        aria-hidden="true"
      >
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
      :processing="editor.processing.value"
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
    <ConfirmModal
      :open="Boolean(deleteConfirmation)"
      :title="deleteConfirmation?.title || '确认删除'"
      :message="deleteConfirmation?.message || ''"
      :detail="deleteConfirmation?.detail || ''"
      :eyebrow="
        deleteConfirmation?.mode === 'conversation'
          ? '创作记录管理'
          : '本地作品管理'
      "
      :confirm-label="
        deleteConfirmation?.mode === 'conversation'
          ? '删除记录'
          : deleteConfirmation?.mode === 'all'
            ? '清空全部'
            : '永久删除'
      "
      :busy="deleteConfirmationBusy"
      @close="deleteConfirmation = null"
      @confirm="confirmDeleteRequest"
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
      @cancel="ocr.cancel"
      @close="ocr.close"
      @copy="ocr.copyText"
    />
    <SettingsModal
      :open="settingsOpen"
      :endpoint="settingsEndpoint"
      :api-key="settingsApiKey"
      :storage-path="galleryDirectory"
      :default-storage-path="defaultGalleryDirectory"
      :saving="settingsSaving"
      @close="settingsOpen = false"
      @save="saveSettings"
    />
    <AboutModal
      :open="aboutOpen"
      :app-info="appInfo"
      @close="aboutOpen = false"
      @copy-email="copyAuthorEmail"
      @show-guide="showOnboardingFromAbout"
    />
    <OnboardingModal
      :open="onboardingOpen"
      @close="finishOnboarding"
      @finish="finishOnboarding"
    />
    <ToastMessage
      v-if="toast && toast.view === view"
      :toast="toast"
      @close="toast = null"
    />
  </div>
</template>
