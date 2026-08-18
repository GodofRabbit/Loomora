<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import {
  Check,
  CheckCheck,
  CircleX,
  Copy,
  FolderDown,
  FolderHeart,
  FolderOpen,
  Heart,
  History,
  ImagePlus,
  ListChecks,
  MessageSquareText,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Tags,
  Trash2,
  Upload,
  X,
} from 'lucide-vue-next';
import aiAvatar from '../../assets/avatars/ai-avatar.svg';
import userAvatar from '../../assets/avatars/user-avatar.png';
import DropdownSelect from './DropdownSelect.vue';

const props = defineProps({
  view: { type: String, required: true },
  active: { type: Boolean, default: true },
  conversationHistory: { type: Array, default: () => [] },
  conversationLoading: Boolean,
  conversationOffset: { type: Number, default: 0 },
  conversationTotal: { type: Number, default: 0 },
  conversationStartMode: Boolean,
  conversationHasOlder: Boolean,
  conversationHasNewer: Boolean,
  scrollBottomSignal: { type: Number, default: 0 },
  followBottomSignal: { type: Number, default: 0 },
  images: { type: Array, required: true },
  imagePaths: { type: Array, required: true },
  liveImage: { type: String, default: '' },
  liveMessage: { type: String, default: '' },
  generationMode: { type: String, default: 'idle' },
  liveProgress: { type: Object, default: () => ({}) },
  liveActive: Boolean,
  gallery: { type: Array, required: true },
  galleryTotal: { type: Number, default: 0 },
  galleryFavoriteCount: { type: Number, default: 0 },
  galleryTrashCount: { type: Number, default: 0 },
  galleryTrashBusy: Boolean,
  galleryScope: { type: String, default: 'all' },
  galleryColumns: { type: Array, required: true },
  galleryColumnCount: { type: Number, required: true },
  galleryLoading: Boolean,
  galleryImporting: Boolean,
  galleryFilterDate: { type: String, default: 'all' },
  gallerySearch: { type: String, default: '' },
  galleryAlbums: { type: Array, default: () => [] },
  galleryTags: { type: Array, default: () => [] },
  galleryAlbum: { type: String, default: 'all' },
  galleryTag: { type: String, default: 'all' },
  galleryColor: { type: String, default: 'all' },
  gallerySelectionMode: Boolean,
  gallerySelectedPaths: { type: Array, default: () => [] },
  gallerySelectedCount: { type: Number, default: 0 },
  galleryExporting: Boolean,
  galleryDeleting: Boolean,
  galleryFavoriteUpdatingPaths: { type: Array, default: () => [] },
});
const emit = defineEmits([
  'preview',
  'context-menu',
  'import',
  'import-drop',
  'toggle-selection',
  'toggle-selection-mode',
  'export-current',
  'export-selected',
  'clear-all',
  'delete-selected',
  'toggle-favorite',
  'view-prompt',
  'update-gallery-scope',
  'update-gallery-search',
  'update-gallery-album',
  'update-gallery-tag',
  'update-gallery-color',
  'organize-selected',
  'restore-trash',
  'delete-trash',
  'empty-trash',
  'load-older-conversations',
  'load-newer-conversations',
  'load-latest-conversations',
  'show-conversation-history',
  'copy-prompt',
  'edit-prompt',
  'delete-conversation',
  'regenerate-conversation',
  'reference-conversation-image',
  'open-conversation-folder',
  'conversation-scroll',
  'conversation-scroll-state',
]);
const galleryAlbumOptions = computed(() => [
  { value: 'all', label: '全部专辑' },
  ...props.galleryAlbums.map((album) => ({ value: album, label: album })),
]);
const galleryTagOptions = computed(() => [
  { value: 'all', label: '全部标签' },
  ...props.galleryTags.map((tag) => ({ value: tag, label: tag })),
]);
const galleryColorOptions = [
  { value: 'all', label: '全部颜色' },
  { value: 'red', label: '红色' },
  { value: 'gold', label: '金色' },
  { value: 'green', label: '绿色' },
  { value: 'blue', label: '蓝色' },
  { value: 'purple', label: '紫色' },
];
const dragActive = ref(false);
const generationChat = ref(null);
const gallerySticky = ref(null);
const libraryGallery = ref(null);
const galleryStickyStuck = ref(false);
const suppressConversationScroll = ref(false);
const conversationScrolledAway = ref(false);
const conversationLoadDirection = ref('');
const galleryViewport = ref({ top: 0, bottom: 900 });
const galleryColumnWidth = ref(280);
const galleryMeasurementVersion = ref(0);
const galleryCardHeights = new Map();
const galleryCardElements = new Map();
let suppressConversationTimer;
let scrollSettleTimer;
let pageRestoreTimer;
let pageLoadFrame;
let followBottomFrame;
let externalRestoreFrame;
let galleryVirtualFrame;
let galleryCardObserver;
let pendingConversationLoad = null;
let scrollBottomRequested = false;
let conversationLoadStartedAt = 0;
let lastConversationScrollTop = 0;
let galleryScrollRoot;
let galleryStickyFrame;
const CONVERSATION_LOAD_EDGE = 40;
const CONVERSATION_LOADING_MIN_DURATION = 220;
const GALLERY_CARD_GAP = 16;
const GALLERY_CARD_HEIGHT_ESTIMATE = 340;
const GALLERY_CARD_META_HEIGHT = 60;
const GALLERY_VIRTUAL_OVERSCAN = 900;
const estimatedGalleryCardHeight = computed(() => {
  void galleryMeasurementVersion.value;
  if (!galleryCardHeights.size) return GALLERY_CARD_HEIGHT_ESTIMATE;
  let total = 0;
  for (const height of galleryCardHeights.values()) total += height;
  return Math.max(180, Math.min(560, total / galleryCardHeights.size));
});
const galleryColumnLayouts = computed(() => {
  void galleryMeasurementVersion.value;
  return props.galleryColumns.map((items) => {
    const offsets = [];
    const heights = [];
    let totalHeight = 0;
    for (const item of items) {
      const height = galleryCardHeight(item);
      offsets.push(totalHeight);
      heights.push(height);
      totalHeight += height + GALLERY_CARD_GAP;
    }
    return { items, offsets, heights, totalHeight };
  });
});
const virtualGalleryColumns = computed(() => {
  const visibleTop = Math.max(
    0,
    galleryViewport.value.top - GALLERY_VIRTUAL_OVERSCAN,
  );
  const visibleBottom = galleryViewport.value.bottom + GALLERY_VIRTUAL_OVERSCAN;
  return galleryColumnLayouts.value.map((layout) => {
    const start = firstGalleryItemAt(layout, visibleTop);
    let end = start;
    while (end < layout.items.length && layout.offsets[end] <= visibleBottom) {
      end += 1;
    }
    const topSpacer = layout.offsets[start] || 0;
    const renderedBottom =
      end > start
        ? layout.offsets[end - 1] + layout.heights[end - 1] + GALLERY_CARD_GAP
        : topSpacer;
    return {
      items: layout.items.slice(start, end),
      topSpacer,
      bottomSpacer: Math.max(0, layout.totalHeight - renderedBottom),
    };
  });
});
const galleryHeadText = computed(() => {
  if (props.galleryLoading) return '正在读取本地作品...';
  if (props.galleryExporting) return '正在导出到文件夹...';
  if (props.gallerySelectionMode) {
    return props.gallerySelectedCount
      ? `已勾选 ${props.gallerySelectedCount} 张，可导出为文件夹`
      : '勾选图片后可批量导出';
  }
  if (props.galleryScope === 'favorites') {
    return `${props.gallery.length} 张收藏作品，仍按最新日期排列`;
  }
  if (props.galleryScope === 'trash') {
    return props.gallery.length
      ? `${props.gallery.length} 张已删除作品，可恢复到原目录`
      : '回收站中的图片仅保存在本机';
  }
  if (props.galleryFilterDate === 'all') {
    return `${props.gallery.length} 张本地作品，可点击导出全部或勾选后批量导出`;
  }
  return `${props.gallery.length} 张本地作品，当前日期可直接导出为文件夹`;
});
const galleryExportCurrentLabel = computed(() =>
  props.galleryScope === 'favorites'
    ? '导出收藏'
    : props.galleryFilterDate === 'all'
      ? '导出全部'
      : '导出当前',
);
const galleryExportCurrentTitle = computed(() =>
  props.galleryScope === 'favorites'
    ? '导出当前筛选出的收藏作品'
    : props.galleryFilterDate === 'all'
      ? '导出全部作品到文件夹'
      : '导出当前日期到文件夹',
);
function acceptsFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

function onDragEnter(event) {
  if (props.galleryScope !== 'trash' && acceptsFiles(event)) {
    dragActive.value = true;
  }
}

function onDragOver(event) {
  if (props.galleryScope === 'trash' || !acceptsFiles(event)) return;
  event.dataTransfer.dropEffect = 'copy';
  dragActive.value = true;
}

function onDragLeave(event) {
  if (
    event.relatedTarget instanceof Node &&
    event.currentTarget.contains(event.relatedTarget)
  ) {
    return;
  }
  dragActive.value = false;
}

function onDrop(event) {
  dragActive.value = false;
  if (props.galleryScope === 'trash') return;
  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length) emit('import-drop', files);
}

function galleryCardHeight(item) {
  const measuredHeight = galleryCardHeights.get(item.path);
  if (measuredHeight) return measuredHeight;
  const width = Number(item.width);
  const height = Number(item.height);
  if (width > 0 && height > 0) {
    return (
      (galleryColumnWidth.value * height) / width + GALLERY_CARD_META_HEIGHT
    );
  }
  return estimatedGalleryCardHeight.value;
}

function firstGalleryItemAt(layout, target) {
  let low = 0;
  let high = layout.items.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const itemBottom =
      layout.offsets[middle] + layout.heights[middle] + GALLERY_CARD_GAP;
    if (itemBottom < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function setGalleryCardRef(element, item) {
  const current = galleryCardElements.get(item.path);
  if (!element) {
    if (current) galleryCardObserver?.unobserve(current);
    galleryCardElements.delete(item.path);
    return;
  }
  if (current === element) return;
  if (current) galleryCardObserver?.unobserve(current);
  galleryCardElements.set(item.path, element);
  galleryCardObserver?.observe(element);
}

function scheduleGalleryViewportUpdate() {
  window.cancelAnimationFrame(galleryVirtualFrame);
  galleryVirtualFrame = window.requestAnimationFrame(() => {
    const gallery = libraryGallery.value;
    const scrollRoot = galleryScrollRoot;
    if (!gallery || !scrollRoot || props.view !== 'gallery' || !props.active) {
      return;
    }
    const galleryRect = gallery.getBoundingClientRect();
    const rootRect = scrollRoot.getBoundingClientRect();
    const nextColumnWidth = Math.max(
      1,
      (gallery.clientWidth -
        GALLERY_CARD_GAP * Math.max(0, props.galleryColumnCount - 1)) /
        Math.max(1, props.galleryColumnCount),
    );
    if (Math.abs(galleryColumnWidth.value - nextColumnWidth) > 2) {
      galleryColumnWidth.value = nextColumnWidth;
      galleryCardHeights.clear();
      galleryMeasurementVersion.value += 1;
    }
    const top = Math.max(0, rootRect.top - galleryRect.top);
    const bottom = Math.max(top, rootRect.bottom - galleryRect.top);
    const current = galleryViewport.value;
    if (
      Math.abs(current.top - top) > 1 ||
      Math.abs(current.bottom - bottom) > 1
    ) {
      galleryViewport.value = { top, bottom };
    }
  });
}

function syncGalleryMeasurements() {
  const paths = new Set(props.gallery.map((item) => item.path));
  for (const itemPath of galleryCardHeights.keys()) {
    if (!paths.has(itemPath)) galleryCardHeights.delete(itemPath);
  }
  galleryMeasurementVersion.value += 1;
  nextTick(scheduleGalleryViewportUpdate);
}

function isSelected(filePath) {
  return props.gallerySelectedPaths.includes(filePath);
}

function favoriteUpdating(filePath) {
  return props.galleryFavoriteUpdatingPaths.includes(filePath);
}

function turnTime(turn) {
  if (!turn?.createdAt) return '';
  return new Date(turn.createdAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function turnDisplayIndex(index) {
  const total =
    Number(props.conversationTotal) || props.conversationHistory.length;
  const count = props.conversationHistory.length;
  if (!total || !count) return index + 1;
  return Math.max(1, total - props.conversationOffset - count + 1) + index;
}

function turnMeta(turn) {
  return [
    turn.model,
    turn.ratio,
    turn.resolution,
    turn.quality && turn.quality !== 'auto'
      ? `质量 ${turn.quality}`
      : '自动质量',
    turn.outputFormat ? turn.outputFormat.toUpperCase() : '',
    `${turn.count || 1} 张`,
    turn.referenceCount ? `${turn.referenceCount} 张参考图` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function turnStatusText(turn) {
  if (turn.status === 'cancelled') return '已取消生成';
  if (turn.status === 'error') return turn.error || turn.message || '生成失败';
  if (turn.status === 'done') {
    const count = turn.images?.length || turn.progress?.completed || 0;
    return count ? `已生成 ${count} 张图片` : '生成完成';
  }
  return turn.message || '正在生成图片...';
}

function previewWidthByRatio(ratio, mode = 'single') {
  const widthMap = {
    single: {
      '1:1': 248,
      '16:9': 308,
      '9:16': 208,
      '4:3': 286,
      '3:4': 230,
      '3:2': 292,
      '2:3': 218,
    },
    batch: {
      '1:1': 150,
      '16:9': 184,
      '9:16': 126,
      '4:3': 168,
      '3:4': 136,
      '3:2': 176,
      '2:3': 136,
    },
  };
  return widthMap[mode]?.[ratio] || (mode === 'batch' ? 136 : 240);
}

function turnPreviewStyle(turn) {
  const [width, height] = String(turn?.ratio || '1:1')
    .split(':')
    .map(Number);
  const ratio = width && height ? `${width} / ${height}` : '4 / 3';
  const requestedTotal = Math.max(
    1,
    Number(turn?.progress?.total) || Number(turn?.count) || 1,
  );
  const imageTotal = Math.max(0, Number(turn?.images?.length) || 0);
  const preserveRequestedLayout = turn?.status !== 'done';
  const layoutTotal = preserveRequestedLayout
    ? requestedTotal
    : Math.max(1, imageTotal);
  const renderedTotal = ['running', 'error'].includes(turn?.status)
    ? requestedTotal
    : Math.max(1, imageTotal);
  const mode = layoutTotal > 1 ? 'batch' : 'single';
  const previewWidth = previewWidthByRatio(turn?.ratio, mode);
  const columns = mode === 'batch' ? Math.min(6, renderedTotal) : 1;
  const gridWidth = previewWidth * columns + 12 * (columns - 1);
  const cardColumns = mode === 'batch' ? Math.min(6, layoutTotal) : 1;
  const cardGridWidth = previewWidth * cardColumns + 12 * (cardColumns - 1);
  return {
    '--generation-ratio': ratio,
    '--generation-preview-width': `${previewWidth}px`,
    '--generation-slot-width': `${previewWidth}px`,
    '--generation-grid-columns': columns,
    '--generation-grid-width': `${gridWidth}px`,
    '--generation-card-width': `${Math.max(280, cardGridWidth + 30)}px`,
  };
}

function turnSlots(turn) {
  const total = Math.max(
    1,
    Number(turn.progress?.total) || Number(turn.count) || 1,
  );
  const completed = Number(turn.progress?.completed) || 0;
  return Array.from({ length: Math.min(10, total) }, (_, index) => ({
    index,
    done: index < completed,
  }));
}

function turnSlotState(turn, slot) {
  const currentLiveImage =
    turn.mode === 'stream' ? turn.liveImage || props.liveImage : '';
  const image = Array.isArray(turn.images) ? turn.images[slot.index] : '';
  const src = image || (slot.index === 0 ? currentLiveImage : '');
  return {
    src,
    persisted: Boolean(image),
    done: Boolean(src) || slot.done,
  };
}

function turnPreviewSlots(turn) {
  if (turn.status === 'error') {
    return turnSlots(turn).map((slot) => {
      const image = Array.isArray(turn.images) ? turn.images[slot.index] : '';
      return {
        ...slot,
        src: image,
        persisted: Boolean(image),
        done: Boolean(image),
        failed: !image,
      };
    });
  }
  if (turn.status !== 'running') {
    return (turn.images || []).map((src, index) => ({
      index,
      src,
      persisted: true,
      done: true,
      failed: false,
    }));
  }
  return turnSlots(turn).map((slot) => ({
    ...slot,
    ...turnSlotState(turn, slot),
  }));
}

function conversationWindowKey() {
  const turns = props.conversationHistory;
  return `${turns.length}:${turns[0]?.id || ''}:${turns.at(-1)?.id || ''}`;
}

function conversationAnchor(element, direction) {
  const rootRect = element.getBoundingClientRect();
  const rootTop = rootRect.top;
  const turns = Array.from(
    element.querySelectorAll('[data-conversation-id]'),
  ).filter((node) => {
    const rect = node.getBoundingClientRect();
    return rect.bottom > rootTop && rect.top < rootRect.bottom;
  });
  const node = direction === 'newer' ? turns.at(-1) : turns[0];
  if (!node) return null;
  return {
    id: node.dataset.conversationId,
    top: node.getBoundingClientRect().top - rootTop,
  };
}

function restoreConversationAnchor(element, anchor) {
  if (!anchor?.id) return false;
  const rootTop = element.getBoundingClientRect().top;
  const node = Array.from(
    element.querySelectorAll('[data-conversation-id]'),
  ).find((item) => item.dataset.conversationId === anchor.id);
  if (!node) return false;
  element.scrollTop += node.getBoundingClientRect().top - rootTop - anchor.top;
  return true;
}

function captureConversationScrollSnapshot() {
  const element = generationChat.value;
  if (!element || props.view !== 'create') return null;
  const distanceFromBottom = Math.max(
    0,
    element.scrollHeight - element.clientHeight - element.scrollTop,
  );
  return {
    anchor: conversationAnchor(element, 'older'),
    scrollTop: element.scrollTop,
    atBottom: props.conversationOffset === 0 && distanceFromBottom <= 72,
  };
}

function restoreConversationScrollSnapshot(snapshot, options = {}) {
  if (!snapshot || props.view !== 'create') return;
  const duration = Number(options.duration) || 380;
  window.cancelAnimationFrame(externalRestoreFrame);
  nextTick(() => {
    const startedAt = performance.now();
    suppressConversationScroll.value = true;

    const restore = (now) => {
      const element = generationChat.value;
      if (!element || !props.active) {
        suppressConversationScroll.value = false;
        return;
      }
      if (snapshot.atBottom && props.conversationOffset === 0) {
        element.scrollTop = element.scrollHeight;
      } else if (!restoreConversationAnchor(element, snapshot.anchor)) {
        element.scrollTop = Math.min(
          Number(snapshot.scrollTop) || 0,
          Math.max(0, element.scrollHeight - element.clientHeight),
        );
      }
      lastConversationScrollTop = element.scrollTop;
      if (now - startedAt < duration) {
        externalRestoreFrame = window.requestAnimationFrame(restore);
        return;
      }
      externalRestoreFrame = undefined;
      suppressConversationScroll.value = false;
      setConversationAwayFromBottom(measureConversationAwayFromBottom());
    };

    externalRestoreFrame = window.requestAnimationFrame(restore);
  });
}

defineExpose({
  captureConversationScrollSnapshot,
  restoreConversationScrollSnapshot,
});

function clearScrollSettleTimers() {
  window.clearTimeout(suppressConversationTimer);
  window.clearTimeout(scrollSettleTimer);
  window.clearTimeout(pageRestoreTimer);
  window.cancelAnimationFrame(pageLoadFrame);
  window.cancelAnimationFrame(followBottomFrame);
  window.cancelAnimationFrame(externalRestoreFrame);
  externalRestoreFrame = undefined;
}

function updateGalleryStickyState() {
  if (!props.active) return;
  window.cancelAnimationFrame(galleryStickyFrame);
  scheduleGalleryViewportUpdate();
  galleryStickyFrame = window.requestAnimationFrame(() => {
    const sticky = gallerySticky.value;
    const scrollRoot = galleryScrollRoot;
    if (!sticky || !scrollRoot || !props.active) return;
    const rootTop = scrollRoot.getBoundingClientRect().top;
    galleryStickyStuck.value =
      scrollRoot.scrollTop > 0 &&
      sticky.getBoundingClientRect().top <= rootTop + 1;
  });
}

function measureConversationAwayFromBottom() {
  const element = generationChat.value;
  if (!element) return false;
  if (props.conversationOffset > 0) return true;
  const distance =
    element.scrollHeight - element.clientHeight - element.scrollTop;
  if (conversationScrolledAway.value) return distance > 72;
  return distance > 180;
}

function scrollConversationToBottom({ smooth = false } = {}) {
  const element = generationChat.value;
  if (!element || props.view !== 'create' || !props.active) return;
  nextTick(() => {
    clearScrollSettleTimers();
    suppressConversationScroll.value = true;
    if (smooth) {
      element.scrollTo({
        top: element.scrollHeight,
        behavior: 'smooth',
      });
    } else {
      element.scrollTop = element.scrollHeight;
    }

    const settleDelay = smooth ? 640 : 120;
    scrollSettleTimer = window.setTimeout(
      () => {
        element.scrollTop = element.scrollHeight;
      },
      Math.max(80, settleDelay - 180),
    );

    suppressConversationTimer = window.setTimeout(() => {
      element.scrollTop = element.scrollHeight;
      lastConversationScrollTop = element.scrollTop;
      suppressConversationScroll.value = false;
      setConversationAwayFromBottom(measureConversationAwayFromBottom());
    }, settleDelay);
  });
}

function followConversationBottomDuringTransition() {
  const element = generationChat.value;
  if (!element || props.view !== 'create' || !props.active) return;

  nextTick(() => {
    clearScrollSettleTimers();
    suppressConversationScroll.value = true;
    const startedAt = performance.now();

    const follow = (now) => {
      element.scrollTop = element.scrollHeight;
      if (now - startedAt < 380) {
        followBottomFrame = window.requestAnimationFrame(follow);
        return;
      }

      followBottomFrame = undefined;
      lastConversationScrollTop = element.scrollTop;
      suppressConversationScroll.value = false;
      setConversationAwayFromBottom(measureConversationAwayFromBottom());
    };

    followBottomFrame = window.requestAnimationFrame(follow);
  });
}

function flushScrollBottomRequest() {
  if (
    !scrollBottomRequested ||
    props.view !== 'create' ||
    !props.active ||
    props.conversationLoading ||
    pendingConversationLoad
  ) {
    return;
  }
  scrollBottomRequested = false;
  if (props.conversationOffset > 0) {
    pendingConversationLoad = {
      direction: 'latest',
      windowKey: conversationWindowKey(),
      anchor: null,
    };
    conversationLoadDirection.value = 'latest';
    conversationLoadStartedAt = performance.now();
    suppressConversationScroll.value = true;
    nextTick(() => {
      pageLoadFrame = window.requestAnimationFrame(() => {
        if (pendingConversationLoad?.direction === 'latest') {
          if (props.conversationLoading) {
            pendingConversationLoad = null;
            conversationLoadDirection.value = '';
            suppressConversationScroll.value = false;
            scrollBottomRequested = true;
            return;
          }
          emit('load-latest-conversations');
        }
      });
    });
    return;
  }
  scrollConversationToBottom({ smooth: true });
}

function onCreationStateEntered() {
  if (props.conversationHistory.length && !conversationScrolledAway.value) {
    scrollConversationToBottom();
  }
}

function setConversationAwayFromBottom(value, options = {}) {
  if (conversationScrolledAway.value === value) {
    if (!value && options.userScrolledTowardBottom) {
      emit('conversation-scroll-state', {
        awayFromBottom: false,
        userScrolledTowardBottom: true,
      });
    }
    return;
  }
  conversationScrolledAway.value = value;
  emit('conversation-scroll-state', {
    awayFromBottom: value,
    userScrolledTowardBottom: Boolean(options.userScrolledTowardBottom),
  });
}

function requestConversationWindow(direction) {
  const element = generationChat.value;
  if (
    !element ||
    props.conversationLoading ||
    pendingConversationLoad ||
    (direction === 'older' && !props.conversationHasOlder) ||
    (direction === 'newer' && !props.conversationHasNewer)
  ) {
    return;
  }
  pendingConversationLoad = {
    direction,
    windowKey: conversationWindowKey(),
    anchor: conversationAnchor(element, direction),
  };
  conversationLoadDirection.value = direction;
  conversationLoadStartedAt = performance.now();
  suppressConversationScroll.value = true;
  nextTick(() => {
    pageLoadFrame = window.requestAnimationFrame(() => {
      if (!pendingConversationLoad) return;
      if (direction === 'older') emit('load-older-conversations');
      else emit('load-newer-conversations');
    });
  });
}

function restoreConversationWindow() {
  const pending = pendingConversationLoad;
  const element = generationChat.value;
  if (!pending || !element || props.conversationLoading) return;
  window.clearTimeout(pageRestoreTimer);
  nextTick(() => {
    if (pending !== pendingConversationLoad) return;
    const maxScrollTop = Math.max(
      0,
      element.scrollHeight - element.clientHeight,
    );
    if (pending.direction === 'latest') {
      element.scrollTop = maxScrollTop;
    } else if (pending.windowKey !== conversationWindowKey()) {
      restoreConversationAnchor(element, pending.anchor);
    }
    lastConversationScrollTop = element.scrollTop;

    const finishRestore = () => {
      window.requestAnimationFrame(() => {
        if (pending !== pendingConversationLoad) return;
        pendingConversationLoad = null;
        conversationLoadDirection.value = '';
        suppressConversationScroll.value = false;
        setConversationAwayFromBottom(measureConversationAwayFromBottom());
        if (scrollBottomRequested) nextTick(flushScrollBottomRequest);
      });
    };
    const loadingElapsed = performance.now() - conversationLoadStartedAt;
    const indicatorDelay = Math.max(
      0,
      CONVERSATION_LOADING_MIN_DURATION - loadingElapsed,
    );
    if (indicatorDelay) {
      pageRestoreTimer = window.setTimeout(finishRestore, indicatorDelay);
    } else {
      finishRestore();
    }
  });
}

function onConversationScroll() {
  if (suppressConversationScroll.value) return;
  const element = generationChat.value;
  if (!element) return;
  const scrollTop = element.scrollTop;
  const direction = scrollTop - lastConversationScrollTop;
  lastConversationScrollTop = scrollTop;
  const awayFromBottom = measureConversationAwayFromBottom();
  setConversationAwayFromBottom(awayFromBottom, {
    userScrolledTowardBottom: direction > 0,
  });
  if (direction < 0 || (direction > 0 && awayFromBottom)) {
    emit('conversation-scroll', { force: true });
  }

  if (direction < 0 && scrollTop <= CONVERSATION_LOAD_EDGE) {
    requestConversationWindow('older');
    return;
  }
  const distanceFromBottom =
    element.scrollHeight - element.clientHeight - scrollTop;
  if (direction > 0 && distanceFromBottom <= CONVERSATION_LOAD_EDGE) {
    requestConversationWindow('newer');
  }
}

watch(
  () => [
    props.view,
    props.conversationOffset,
    props.conversationHistory.length,
    props.liveImage,
    props.liveMessage,
    props.conversationLoading,
  ],
  () => {
    if (
      props.view !== 'create' ||
      !props.active ||
      props.conversationLoading ||
      pendingConversationLoad ||
      conversationScrolledAway.value
    ) {
      return;
    }
    scrollConversationToBottom();
  },
  { immediate: true },
);

watch(
  () => [
    props.conversationLoading,
    props.conversationOffset,
    conversationWindowKey(),
  ],
  () => {
    restoreConversationWindow();
    if (!props.conversationLoading && !pendingConversationLoad) {
      nextTick(flushScrollBottomRequest);
    }
  },
);

watch(
  () => [
    props.view,
    props.galleryLoading,
    props.gallery.map((item) => item.path).join('\n'),
  ],
  syncGalleryMeasurements,
  { immediate: true },
);

watch(
  () => props.galleryColumnCount,
  () => {
    galleryCardHeights.clear();
    galleryMeasurementVersion.value += 1;
    nextTick(scheduleGalleryViewportUpdate);
  },
);

watch(
  () => props.active,
  (active) => {
    if (!active) return;
    nextTick(updateGalleryStickyState);
  },
);

watch(
  () => props.scrollBottomSignal,
  () => {
    if (props.view !== 'create' || !props.active) return;
    scrollBottomRequested = true;
    flushScrollBottomRequest();
  },
);

watch(
  () => props.followBottomSignal,
  () => {
    followConversationBottomDuringTransition();
  },
);

onMounted(() => {
  galleryCardObserver = new ResizeObserver((entries) => {
    let changed = false;
    for (const entry of entries) {
      const itemPath = entry.target.dataset.galleryPath;
      const height =
        entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height;
      if (
        !itemPath ||
        !height ||
        Math.abs((galleryCardHeights.get(itemPath) || 0) - height) < 1
      ) {
        continue;
      }
      galleryCardHeights.set(itemPath, height);
      changed = true;
    }
    if (changed) galleryMeasurementVersion.value += 1;
  });
  nextTick(() => {
    galleryScrollRoot = gallerySticky.value?.closest('.content-scroll');
    galleryScrollRoot?.addEventListener('scroll', updateGalleryStickyState, {
      passive: true,
    });
    window.addEventListener('resize', updateGalleryStickyState);
    updateGalleryStickyState();
  });
});

onBeforeUnmount(() => {
  clearScrollSettleTimers();
  window.cancelAnimationFrame(externalRestoreFrame);
  galleryCardObserver?.disconnect();
  galleryCardElements.clear();
  galleryScrollRoot?.removeEventListener('scroll', updateGalleryStickyState);
  window.removeEventListener('resize', updateGalleryStickyState);
  window.cancelAnimationFrame(galleryStickyFrame);
  window.cancelAnimationFrame(galleryVirtualFrame);
});
</script>

<template>
  <section
    class="works"
    :class="{
      'library-view': view === 'gallery',
      'library-loading-view': view === 'gallery' && galleryLoading,
      'library-empty-view':
        view === 'gallery' && !galleryLoading && !gallery.length,
      'selection-mode': view === 'gallery' && gallerySelectionMode,
    }"
  >
    <div
      v-if="view === 'gallery'"
      ref="gallerySticky"
      class="gallery-sticky"
      :class="{ stuck: galleryStickyStuck }"
    >
      <div class="works-head">
        <div class="works-head-title">
          <span class="section-kicker">Works Gallery</span>
          <h1>作品库</h1>
        </div>
        <div class="gallery-search-tools">
          <div class="gallery-scope-toggle" aria-label="作品范围">
            <button
              type="button"
              :class="{ active: galleryScope === 'all' }"
              :aria-pressed="galleryScope === 'all'"
              @click="emit('update-gallery-scope', 'all')"
            >
              全部
            </button>
            <button
              type="button"
              :class="{ active: galleryScope === 'favorites' }"
              :aria-pressed="galleryScope === 'favorites'"
              @click="emit('update-gallery-scope', 'favorites')"
            >
              <Heart aria-hidden="true" />收藏
              <b>{{ galleryFavoriteCount }}</b>
            </button>
            <button
              type="button"
              :class="{ active: galleryScope === 'trash' }"
              :aria-pressed="galleryScope === 'trash'"
              @click="emit('update-gallery-scope', 'trash')"
            >
              <Trash2 aria-hidden="true" />回收站
              <b>{{ galleryTrashCount }}</b>
            </button>
          </div>
          <div class="gallery-search">
            <Search aria-hidden="true" />
            <input
              :value="gallerySearch"
              type="search"
              placeholder="搜索名称、提示词、标签或备注"
              aria-label="搜索作品库"
              @input="emit('update-gallery-search', $event.target.value)"
            />
          </div>
        </div>
        <div class="gallery-head-actions">
          <template v-if="galleryScope !== 'trash'">
            <button
              type="button"
              class="gallery-import-button"
              :disabled="
                galleryLoading ||
                galleryImporting ||
                galleryExporting ||
                galleryDeleting
              "
              title="从电脑导入图片"
              @click="emit('import')"
            >
              <ImagePlus aria-hidden="true" />
              <span>{{ galleryImporting ? '导入中...' : '导入' }}</span>
            </button>
            <button
              type="button"
              class="gallery-select-button"
              :class="{ active: gallerySelectionMode }"
              :disabled="
                galleryLoading ||
                galleryImporting ||
                galleryExporting ||
                galleryDeleting ||
                !gallery.length
              "
              :title="
                gallerySelectionMode
                  ? '退出批量整理'
                  : '选择作品后设置专辑、标签和颜色'
              "
              @click="emit('toggle-selection-mode')"
            >
              <ListChecks aria-hidden="true" />
              <span>{{ gallerySelectionMode ? '退出整理' : '批量整理' }}</span>
            </button>
            <button
              type="button"
              class="gallery-export-button"
              :disabled="
                galleryLoading ||
                galleryImporting ||
                galleryExporting ||
                galleryDeleting ||
                !gallery.length
              "
              :title="galleryExportCurrentTitle"
              @click="emit('export-current')"
            >
              <FolderDown aria-hidden="true" />
              <span>{{ galleryExportCurrentLabel }}</span>
            </button>
            <button
              type="button"
              class="gallery-clear-button"
              :disabled="
                galleryLoading ||
                galleryImporting ||
                galleryExporting ||
                galleryDeleting ||
                galleryTotal === 0 ||
                galleryScope === 'favorites'
              "
              title="永久删除作品库中的全部图片"
              @click="emit('clear-all')"
            >
              <Trash2 aria-hidden="true" />
              <span>{{ galleryDeleting ? '清空中...' : '清空全部' }}</span>
            </button>
          </template>
          <button
            v-else
            type="button"
            class="gallery-clear-button"
            :disabled="galleryTrashBusy || galleryTrashCount === 0"
            title="永久删除回收站中的全部图片"
            @click="emit('empty-trash')"
          >
            <Trash2 aria-hidden="true" />
            <span>{{ galleryTrashBusy ? '清空中...' : '清空回收站' }}</span>
          </button>
        </div>
      </div>
      <div class="works-head-meta">
        <span>{{ galleryHeadText }}</span>
        <span v-if="galleryScope !== 'trash'" class="gallery-drop-hint">
          <Upload aria-hidden="true" />
          拖拽图片到当前页面即可导入
        </span>
      </div>
      <div
        v-if="galleryScope !== 'trash'"
        class="gallery-metadata-filters"
        aria-label="作品分类筛选"
      >
        <label>
          <FolderHeart aria-hidden="true" />
          <DropdownSelect
            :model-value="galleryAlbum"
            :options="galleryAlbumOptions"
            aria-label="按专辑筛选"
            @update:model-value="emit('update-gallery-album', $event)"
          />
        </label>
        <label>
          <Tags aria-hidden="true" />
          <DropdownSelect
            :model-value="galleryTag"
            :options="galleryTagOptions"
            aria-label="按标签筛选"
            @update:model-value="emit('update-gallery-tag', $event)"
          />
        </label>
        <label>
          <span
            class="gallery-filter-color"
            :class="`color-${galleryColor}`"
            aria-hidden="true"
          ></span>
          <DropdownSelect
            :model-value="galleryColor"
            :options="galleryColorOptions"
            aria-label="按颜色筛选"
            @update:model-value="emit('update-gallery-color', $event)"
          />
        </label>
      </div>
    </div>
    <Transition name="gallery-selection-toolbar">
      <div
        v-if="view === 'gallery' && gallerySelectionMode"
        class="gallery-selection-toolbar"
        role="toolbar"
        aria-label="作品多选操作"
      >
        <span class="gallery-selection-summary">
          <CheckCheck aria-hidden="true" />
          <span
            ><b>{{ gallerySelectedCount }}</b> 张已选择</span
          >
        </span>
        <span class="gallery-selection-divider" aria-hidden="true"></span>
        <button
          type="button"
          class="gallery-selection-organize"
          :disabled="galleryDeleting || gallerySelectedCount === 0"
          title="为已选择的作品设置专辑、标签和颜色"
          @click="emit('organize-selected')"
        >
          <Tags aria-hidden="true" />
          <span>整理已选</span>
        </button>
        <button
          type="button"
          class="gallery-selection-export"
          :disabled="
            galleryExporting || galleryDeleting || gallerySelectedCount === 0
          "
          title="把已选择的图片导出到文件夹"
          @click="emit('export-selected')"
        >
          <FolderDown aria-hidden="true" />
          <span>{{ galleryExporting ? '正在导出...' : '导出已选' }}</span>
        </button>
        <button
          type="button"
          class="gallery-selection-delete"
          :disabled="
            galleryExporting || galleryDeleting || gallerySelectedCount === 0
          "
          title="永久删除已选择的本地图片"
          @click="emit('delete-selected')"
        >
          <Trash2 aria-hidden="true" />
          <span>{{ galleryDeleting ? '正在删除...' : '删除已选' }}</span>
        </button>
        <button
          type="button"
          class="gallery-selection-cancel"
          :disabled="galleryDeleting"
          title="退出多选"
          @click="emit('toggle-selection-mode')"
        >
          <X aria-hidden="true" />
          <span>退出</span>
        </button>
      </div>
    </Transition>
    <div
      v-if="view === 'create'"
      ref="generationChat"
      class="generation-chat"
      :class="{
        empty: !conversationHistory.length,
        'start-screen': conversationStartMode,
      }"
      @scroll="onConversationScroll"
    >
      <Transition
        name="creation-state"
        mode="out-in"
        @after-enter="onCreationStateEntered"
      >
        <div
          v-if="!conversationHistory.length"
          key="creation-start"
          class="creation-state creation-state-start"
        >
          <div class="creation-start">
            <div
              class="creation-start-copy"
              data-onboarding-fallback="conversation"
            >
              <h1>今天想创造什么？</h1>
              <span class="creation-start-divider" aria-hidden="true"
                >&#10022;</span
              >
              <p>灵感落笔处，光芒渐次生</p>
              <button
                v-if="conversationStartMode && conversationTotal"
                type="button"
                class="creation-history-button"
                data-onboarding="conversation"
                title="查看本地保存的创作对话"
                @click="emit('show-conversation-history')"
              >
                <History aria-hidden="true" />
                <span>查看历史创作</span>
                <b>{{ conversationTotal }}</b>
              </button>
            </div>
          </div>
        </div>
        <div
          v-else
          key="creation-history"
          class="creation-state creation-state-history"
        >
          <div
            v-if="conversationLoadDirection === 'older'"
            class="conversation-load-indicator top"
            role="status"
          >
            <span class="conversation-load-spinner"></span>
            <span>正在加载更早的对话...</span>
          </div>
          <article
            v-for="(turn, turnIndex) in conversationHistory"
            :key="turn.id"
            :data-conversation-id="turn.id"
            class="generation-chat-turn"
            :class="[`status-${turn.status}`, `mode-${turn.mode}`]"
          >
            <div class="generation-chat-message user">
              <div class="generation-chat-bubble generation-chat-user-bubble">
                <div class="generation-chat-user-head">
                  <b>第 {{ turnDisplayIndex(turnIndex) }} 轮</b>
                  <small>{{ turnTime(turn) }}</small>
                </div>
                <p>{{ turn.prompt }}</p>
                <div class="generation-chat-user-foot">
                  <small>{{ turnMeta(turn) }}</small>
                  <div class="generation-chat-prompt-actions">
                    <button
                      type="button"
                      title="复制这条提示词"
                      aria-label="复制这条提示词"
                      @click="emit('copy-prompt', turn)"
                    >
                      <Copy aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title="回填到创作面板继续编辑"
                      aria-label="回填到创作面板继续编辑"
                      @click="emit('edit-prompt', turn)"
                    >
                      <Pencil aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="danger"
                      title="删除这轮对话记录，不删除作品库图片"
                      aria-label="删除这轮对话记录，不删除作品库图片"
                      @click="emit('delete-conversation', turn)"
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
              <img
                class="generation-chat-avatar user"
                :src="userAvatar"
                alt="用户头像"
              />
            </div>
            <div class="generation-chat-message assistant">
              <img
                class="generation-chat-avatar assistant"
                :src="aiAvatar"
                alt="Loomora AI 头像"
              />
              <div
                class="generation-chat-bubble generation-chat-assistant-bubble"
                :style="turnPreviewStyle(turn)"
              >
                <div class="generation-chat-response-head">
                  <div class="generation-chat-response-title">
                    <b>{{ turnStatusText(turn) }}</b>
                  </div>
                  <small>{{ turnTime(turn) }}</small>
                </div>
                <div class="generation-chat-response-meta">
                  {{ turnMeta(turn) }}
                </div>
                <div
                  v-if="
                    turn.status === 'running' ||
                    turn.status === 'error' ||
                    turn.images?.length
                  "
                  class="generation-chat-images"
                  :class="{
                    single: turnPreviewSlots(turn).length === 1,
                    running: turn.status === 'running',
                  }"
                  aria-live="polite"
                >
                  <div
                    v-for="slot in turnPreviewSlots(turn)"
                    :key="`${turn.id}-${slot.index}`"
                    class="generation-chat-image-slot"
                    :class="{
                      loading: !slot.src,
                      failed: slot.failed,
                      previewing: slot.src && !slot.persisted,
                      clickable: slot.persisted,
                    }"
                  >
                    <img
                      v-if="slot.src"
                      :src="slot.src"
                      :alt="`生成图片 ${slot.index + 1}`"
                      @click="
                        slot.persisted &&
                        emit('preview', {
                          type: 'conversation',
                          item: turn.id,
                          index: slot.index,
                        })
                      "
                      @contextmenu.prevent="
                        slot.persisted &&
                        emit(
                          'context-menu',
                          $event,
                          slot.src,
                          turn.imagePaths?.[slot.index],
                        )
                      "
                    />
                    <div
                      v-else
                      class="generation-chat-image-placeholder"
                      :class="{ failed: slot.failed }"
                    >
                      <CircleX v-if="slot.failed" aria-hidden="true" />
                      <span v-else class="generation-live-spinner"></span>
                      <b>{{ slot.failed ? '生成失败' : '正在生成中...' }}</b>
                    </div>
                    <span
                      v-if="turnPreviewSlots(turn).length > 1"
                      class="slot-index"
                    >
                      {{ slot.index + 1 }}
                    </span>
                  </div>
                </div>
                <div
                  v-if="turn.status === 'done' && turn.images?.length"
                  class="generation-chat-result-actions"
                >
                  <button
                    type="button"
                    :title="
                      turn.images.length > 1
                        ? `将这 ${turn.images.length} 张图片作为参考图`
                        : '将图片作为参考图'
                    "
                    aria-label="将生成图片作为参考图"
                    @click="emit('reference-conversation-image', turn)"
                  >
                    <ImagePlus aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    title="按这轮对话重新生成"
                    aria-label="按这轮对话重新生成"
                    @click="emit('regenerate-conversation', turn)"
                  >
                    <RefreshCw aria-hidden="true" />
                  </button>
                  <button
                    v-if="turn.imagePaths?.length || turn.folder"
                    type="button"
                    :title="`在文件夹中显示：${turn.imagePaths?.[0] || turn.folder}`"
                    aria-label="在文件夹中显示生成图片"
                    @click="emit('open-conversation-folder', turn)"
                  >
                    <FolderOpen aria-hidden="true" />
                  </button>
                </div>
                <button
                  v-if="turn.status === 'error'"
                  type="button"
                  class="generation-chat-retry-button"
                  :disabled="liveActive"
                  :title="
                    liveActive ? '已有图片正在生成' : '按本轮参数重新生成'
                  "
                  aria-label="按本轮参数重新生成"
                  @click="emit('regenerate-conversation', turn)"
                >
                  <RefreshCw aria-hidden="true" />
                  <span>{{ liveActive ? '正在生成中' : '重新生成' }}</span>
                </button>
              </div>
            </div>
          </article>
          <div
            v-if="
              conversationLoadDirection === 'newer' ||
              conversationLoadDirection === 'latest'
            "
            class="conversation-load-indicator bottom"
            role="status"
          >
            <span class="conversation-load-spinner"></span>
            <span>{{
              conversationLoadDirection === 'latest'
                ? '正在回到最新对话...'
                : '正在加载更新的对话...'
            }}</span>
          </div>
        </div>
      </Transition>
    </div>
    <div
      v-else
      ref="libraryGallery"
      class="gallery library-gallery"
      :style="{ '--library-column-count': galleryColumnCount }"
      :class="{
        empty: galleryLoading || !gallery.length,
        loading: galleryLoading,
        'library-empty': !galleryLoading && !gallery.length,
        'drag-active': dragActive,
      }"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <div
        v-if="dragActive && galleryScope !== 'trash'"
        class="library-drop-overlay"
      >
        <Upload aria-hidden="true" />
        <b>松手即可导入图片</b>
        <small>支持 JPG、PNG、WEBP，可一次拖入多张</small>
      </div>
      <div
        v-for="(column, columnIndex) in galleryLoading || !gallery.length
          ? []
          : virtualGalleryColumns"
        :key="columnIndex"
        class="library-gallery-column"
      >
        <div
          v-if="column.topSpacer"
          class="gallery-virtual-spacer"
          :style="{ height: `${column.topSpacer}px` }"
          aria-hidden="true"
        ></div>
        <article
          v-for="item in column.items"
          :key="item.path"
          :ref="(element) => setGalleryCardRef(element, item)"
          :data-gallery-path="item.path"
          class="gallery-card"
          :class="{ selected: isSelected(item.path) }"
        >
          <div
            v-if="galleryScope === 'trash'"
            class="gallery-card-trash-actions"
          >
            <button
              type="button"
              :disabled="galleryTrashBusy"
              title="恢复到原作品目录"
              aria-label="恢复图片"
              @click.stop="emit('restore-trash', item)"
            >
              <RotateCcw aria-hidden="true" />
            </button>
            <button
              type="button"
              class="danger"
              :disabled="galleryTrashBusy"
              title="彻底删除"
              aria-label="彻底删除图片"
              @click.stop="emit('delete-trash', item)"
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>
          <button
            v-if="!gallerySelectionMode && galleryScope !== 'trash'"
            type="button"
            class="gallery-card-favorite"
            :class="{ active: item.favorite }"
            :disabled="favoriteUpdating(item.path)"
            :aria-pressed="item.favorite === true"
            :aria-label="item.favorite ? '取消收藏' : '收藏图片'"
            :title="item.favorite ? '取消收藏' : '收藏图片'"
            @click.stop="emit('toggle-favorite', item)"
          >
            <Heart aria-hidden="true" />
          </button>
          <button
            v-if="!gallerySelectionMode && galleryScope !== 'trash'"
            type="button"
            class="gallery-card-prompt"
            title="查看图片提示词"
            aria-label="查看图片提示词"
            @click.stop="emit('view-prompt', item)"
          >
            <MessageSquareText aria-hidden="true" />
          </button>
          <button
            v-if="gallerySelectionMode"
            type="button"
            class="gallery-card-check"
            :class="{ selected: isSelected(item.path) }"
            :aria-pressed="isSelected(item.path)"
            :aria-label="isSelected(item.path) ? '取消勾选' : '勾选图片'"
            @click.stop="emit('toggle-selection', item)"
          >
            <Check v-if="isSelected(item.path)" aria-hidden="true" />
          </button>
          <img
            :src="item.data"
            :alt="item.name"
            loading="lazy"
            decoding="async"
            fetchpriority="low"
            @click="
              galleryScope === 'trash'
                ? emit('preview', { type: 'gallery', item })
                : gallerySelectionMode
                  ? emit('toggle-selection', item)
                  : emit('preview', { type: 'gallery', item })
            "
            @contextmenu.prevent="
              galleryScope !== 'trash' &&
              emit('context-menu', $event, item.data, item.path, true)
            "
          />
          <div
            class="gallery-card-meta"
            :class="item.colorLabel ? `color-${item.colorLabel}` : ''"
          >
            <b>{{ item.title || item.name }}</b>
            <small>
              <template v-if="galleryScope === 'trash'">
                删除于 {{ item.date }}
              </template>
              <template v-else>
                {{ item.date
                }}<template v-if="item.album"> · {{ item.album }}</template>
              </template>
            </small>
            <div v-if="item.tags?.length" class="gallery-card-tags">
              <span v-for="tag in item.tags.slice(0, 3)" :key="tag">{{
                tag
              }}</span>
              <span v-if="item.tags.length > 3"
                >+{{ item.tags.length - 3 }}</span
              >
            </div>
          </div>
        </article>
        <div
          v-if="column.bottomSpacer"
          class="gallery-virtual-spacer"
          :style="{ height: `${column.bottomSpacer}px` }"
          aria-hidden="true"
        ></div>
      </div>
      <div v-if="galleryLoading" class="gallery-loading" role="status">
        <span class="gallery-loading-spinner"></span><b>正在加载作品库</b
        ><small>正在读取本地图片，请稍候</small>
      </div>
      <div v-else-if="!gallery.length" class="empty-state">
        <span>✧</span>
        <b>
          {{
            galleryScope === 'favorites'
              ? '还没有收藏作品'
              : galleryScope === 'trash'
                ? '回收站是空的'
                : galleryFilterDate === 'all'
                  ? '作品库还是空的'
                  : '这个日期还没有作品'
          }}
        </b>
        <small>
          {{
            galleryScope === 'favorites'
              ? '收藏的作品会集中显示在这里'
              : galleryScope === 'trash'
                ? '从作品库删除的图片会暂存在这里'
                : galleryFilterDate === 'all'
                  ? '生成的图片会自动出现在这里'
                  : '切回“全部”可以查看其他日期的作品，也可以继续生成新的图片'
          }}
        </small>
        <em
          v-if="galleryScope === 'all' && galleryFilterDate === 'all'"
          class="gallery-empty-drop-hint"
        >
          可点击右侧“导入”，也可以直接把图片拖到作品库里
        </em>
      </div>
    </div>
  </section>
</template>
