<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

const props = defineProps({
  view: { type: String, required: true },
  conversationHistory: { type: Array, default: () => [] },
  conversationLoading: Boolean,
  conversationOffset: { type: Number, default: 0 },
  conversationTotal: { type: Number, default: 0 },
  conversationHasOlder: Boolean,
  conversationHasNewer: Boolean,
  scrollBottomSignal: { type: Number, default: 0 },
  images: { type: Array, required: true },
  imagePaths: { type: Array, required: true },
  liveImage: { type: String, default: '' },
  liveMessage: { type: String, default: '' },
  generationMode: { type: String, default: 'idle' },
  liveProgress: { type: Object, default: () => ({}) },
  liveActive: Boolean,
  gallery: { type: Array, required: true },
  galleryColumns: { type: Array, required: true },
  galleryColumnCount: { type: Number, required: true },
  galleryLoading: Boolean,
  galleryImporting: Boolean,
  galleryFilterDate: { type: String, default: 'all' },
  gallerySearch: { type: String, default: '' },
  gallerySelectionMode: Boolean,
  gallerySelectedPaths: { type: Array, default: () => [] },
  gallerySelectedCount: { type: Number, default: 0 },
  galleryExporting: Boolean,
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
  'update-gallery-search',
  'load-older-conversations',
  'load-newer-conversations',
  'load-latest-conversations',
  'copy-prompt',
  'edit-prompt',
  'delete-conversation',
  'regenerate-conversation',
  'open-conversation-folder',
  'conversation-scroll',
  'conversation-scroll-state',
]);
const dragActive = ref(false);
const generationChat = ref(null);
const gallerySticky = ref(null);
const galleryStickyStuck = ref(false);
const suppressConversationScroll = ref(false);
const conversationScrolledAway = ref(false);
const conversationLoadDirection = ref('');
let suppressConversationTimer;
let scrollSettleTimer;
let pageRestoreTimer;
let pageLoadFrame;
let pendingConversationLoad = null;
let conversationLoadStartedAt = 0;
let lastConversationScrollTop = 0;
let galleryScrollRoot;
let galleryStickyFrame;
const CONVERSATION_LOAD_EDGE = 40;
const CONVERSATION_RESTORE_GAP = 72;
const CONVERSATION_LOADING_MIN_DURATION = 220;
const galleryHeadText = computed(() => {
  if (props.galleryLoading) return '正在读取本地作品...';
  if (props.galleryExporting) return '正在导出到文件夹...';
  if (props.gallerySelectionMode) {
    return props.gallerySelectedCount
      ? `已勾选 ${props.gallerySelectedCount} 张，可导出为文件夹`
      : '勾选图片后可批量导出';
  }
  if (props.galleryFilterDate === 'all') {
    return `${props.gallery.length} 张本地作品，可点击导出全部或勾选后批量导出`;
  }
  return `${props.gallery.length} 张本地作品，当前日期可直接导出为文件夹`;
});
const galleryExportCurrentLabel = computed(() =>
  props.galleryFilterDate === 'all' ? '导出全部' : '导出当前',
);
const galleryExportCurrentTitle = computed(() =>
  props.galleryFilterDate === 'all'
    ? '导出全部作品到文件夹'
    : '导出当前日期到文件夹',
);
function acceptsFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

function onDragEnter(event) {
  if (acceptsFiles(event)) dragActive.value = true;
}

function onDragOver(event) {
  if (!acceptsFiles(event)) return;
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
  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length) emit('import-drop', files);
}

function isSelected(filePath) {
  return props.gallerySelectedPaths.includes(filePath);
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
  const total =
    turn?.status === 'running'
      ? Math.max(1, Number(turn?.progress?.total) || Number(turn?.count) || 1)
      : Math.max(1, turn?.images?.length || 1);
  const mode = total > 1 ? 'batch' : 'single';
  const previewWidth = previewWidthByRatio(turn?.ratio, mode);
  const columns = mode === 'batch' ? Math.min(6, total) : 1;
  const gridWidth = previewWidth * columns + 12 * (columns - 1);
  return {
    '--generation-ratio': ratio,
    '--generation-preview-width': `${previewWidth}px`,
    '--generation-slot-width': `${previewWidth}px`,
    '--generation-grid-columns': columns,
    '--generation-grid-width': `${gridWidth}px`,
    '--generation-card-width': `${Math.max(280, gridWidth + 30)}px`,
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
  if (turn.status !== 'running') {
    return (turn.images || []).map((src, index) => ({
      index,
      src,
      persisted: true,
      done: true,
    }));
  }
  return turnSlots(turn).map((slot) => ({
    ...slot,
    ...turnSlotState(turn, slot),
  }));
}

function clearScrollSettleTimers() {
  window.clearTimeout(suppressConversationTimer);
  window.clearTimeout(scrollSettleTimer);
  window.clearTimeout(pageRestoreTimer);
  window.cancelAnimationFrame(pageLoadFrame);
}

function updateGalleryStickyState() {
  window.cancelAnimationFrame(galleryStickyFrame);
  galleryStickyFrame = window.requestAnimationFrame(() => {
    const sticky = gallerySticky.value;
    const scrollRoot = galleryScrollRoot;
    if (!sticky || !scrollRoot) return;
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
  if (!element || props.view !== 'create') return;
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

function setConversationAwayFromBottom(value) {
  if (conversationScrolledAway.value === value) return;
  conversationScrolledAway.value = value;
  emit('conversation-scroll-state', value);
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
    offset: props.conversationOffset,
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
  const loadingElapsed = performance.now() - conversationLoadStartedAt;
  const restoreDelay = Math.max(
    0,
    CONVERSATION_LOADING_MIN_DURATION - loadingElapsed,
  );
  window.clearTimeout(pageRestoreTimer);
  pageRestoreTimer = window.setTimeout(() => {
    nextTick(() => {
      if (pending.offset === props.conversationOffset) {
        pendingConversationLoad = null;
        conversationLoadDirection.value = '';
        suppressConversationScroll.value = false;
        return;
      }
      const maxScrollTop = Math.max(
        0,
        element.scrollHeight - element.clientHeight,
      );
      if (pending.direction === 'older') {
        element.scrollTop = Math.max(
          0,
          maxScrollTop - CONVERSATION_RESTORE_GAP,
        );
      } else if (pending.direction === 'newer') {
        element.scrollTop = Math.min(CONVERSATION_RESTORE_GAP, maxScrollTop);
      } else {
        element.scrollTop = maxScrollTop;
      }
      lastConversationScrollTop = element.scrollTop;
      window.requestAnimationFrame(() => {
        pendingConversationLoad = null;
        conversationLoadDirection.value = '';
        suppressConversationScroll.value = false;
        setConversationAwayFromBottom(measureConversationAwayFromBottom());
      });
    });
  }, restoreDelay);
}

function onConversationScroll() {
  if (suppressConversationScroll.value) return;
  const element = generationChat.value;
  if (!element) return;
  const scrollTop = element.scrollTop;
  const direction = scrollTop - lastConversationScrollTop;
  lastConversationScrollTop = scrollTop;
  const awayFromBottom = measureConversationAwayFromBottom();
  setConversationAwayFromBottom(awayFromBottom);
  if (awayFromBottom) emit('conversation-scroll');

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

function onConversationWheel(event) {
  if (
    suppressConversationScroll.value ||
    props.conversationLoading ||
    pendingConversationLoad
  ) {
    return;
  }
  const element = generationChat.value;
  if (!element) return;
  if (event.deltaY < 0 && element.scrollTop <= CONVERSATION_LOAD_EDGE) {
    requestConversationWindow('older');
    return;
  }
  const distanceFromBottom =
    element.scrollHeight - element.clientHeight - element.scrollTop;
  if (event.deltaY > 0 && distanceFromBottom <= CONVERSATION_LOAD_EDGE) {
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
  () => [props.conversationLoading, props.conversationOffset],
  () => {
    restoreConversationWindow();
  },
);

watch(
  () => props.scrollBottomSignal,
  () => {
    if (props.conversationOffset > 0) {
      if (props.conversationLoading || pendingConversationLoad) return;
      pendingConversationLoad = {
        direction: 'latest',
        offset: props.conversationOffset,
      };
      conversationLoadDirection.value = 'latest';
      conversationLoadStartedAt = performance.now();
      suppressConversationScroll.value = true;
      nextTick(() => {
        pageLoadFrame = window.requestAnimationFrame(() => {
          if (pendingConversationLoad?.direction === 'latest') {
            emit('load-latest-conversations');
          }
        });
      });
      return;
    }
    scrollConversationToBottom({ smooth: true });
  },
);

onMounted(() => {
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
  galleryScrollRoot?.removeEventListener('scroll', updateGalleryStickyState);
  window.removeEventListener('resize', updateGalleryStickyState);
  window.cancelAnimationFrame(galleryStickyFrame);
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
        <div class="gallery-search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m16.5 16.5 4 4" />
          </svg>
          <input
            :value="gallerySearch"
            type="search"
            placeholder="搜索作品名称或日期"
            aria-label="搜索作品库"
            @input="emit('update-gallery-search', $event.target.value)"
          />
        </div>
      </div>
      <div class="works-head-meta">
        <span>{{ galleryHeadText }}</span>
        <span class="gallery-drop-hint">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v12" />
            <path d="m8 9 4-4 4 4" />
            <path d="M6 15.5V17a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-1.5" />
          </svg>
          拖拽图片到当前页面即可导入
        </span>
      </div>
    </div>
    <div v-if="view === 'gallery'" class="gallery-side-actions">
      <button
        type="button"
        class="gallery-select-button"
        :class="{ active: gallerySelectionMode }"
        :disabled="
          galleryLoading ||
          galleryImporting ||
          galleryExporting ||
          !gallery.length
        "
        :title="
          gallerySelectionMode ? '退出多选' : '进入多选，勾选图片后批量导出'
        "
        @click="emit('toggle-selection-mode')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5.5" y="5.5" width="13" height="13" rx="3" />
          <path d="m8.5 12 2.5 2.5 4.5-4.5" />
        </svg>
        <span>{{ gallerySelectionMode ? '退出多选' : '多选' }}</span>
      </button>
      <button
        type="button"
        class="gallery-export-button"
        :disabled="
          galleryLoading ||
          galleryImporting ||
          galleryExporting ||
          !gallery.length
        "
        :title="galleryExportCurrentTitle"
        @click="emit('export-current')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v8" />
          <path d="m8 9 4 4 4-4" />
          <path d="M5 19h14" />
        </svg>
        <span>{{ galleryExportCurrentLabel }}</span>
      </button>
      <button
        type="button"
        class="gallery-export-button"
        :disabled="
          galleryLoading ||
          galleryImporting ||
          galleryExporting ||
          gallerySelectedCount === 0
        "
        title="导出已勾选图片到文件夹"
        @click="emit('export-selected')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 7h5l1.8 2H18a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"
          />
          <path d="m9 13 2 2 4-4" />
        </svg>
        <span>导出已选</span>
      </button>
      <button
        type="button"
        class="gallery-import-button"
        :disabled="galleryLoading || galleryImporting || galleryExporting"
        @click="emit('import')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21V9" />
          <path d="m8 15 4 4 4-4" />
          <path d="M5 5h14" />
        </svg>
        <span>{{ galleryImporting ? '导入中...' : '导入' }}</span>
      </button>
    </div>
    <div
      v-if="view === 'create'"
      ref="generationChat"
      class="generation-chat"
      :class="{ empty: !conversationHistory.length }"
      @scroll="onConversationScroll"
      @wheel.passive="onConversationWheel"
    >
      <div
        v-if="conversationLoadDirection === 'older'"
        class="conversation-load-indicator top"
        role="status"
      >
        <span class="conversation-load-spinner"></span>
        <span>正在加载更早的对话...</span>
      </div>
      <div v-if="!conversationHistory.length" class="empty-state">
        <span class="create-empty-icon">✧</span><b>织一束光，生成第一幅作品</b
        ><small>每一次生成都会像聊天记录一样保留在这里</small>
      </div>
      <article
        v-for="(turn, turnIndex) in conversationHistory"
        :key="turn.id"
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
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="9" y="9" width="10" height="10" rx="2" />
                    <path d="M5 15V7a2 2 0 0 1 2-2h8" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="回填到创作面板继续编辑"
                  aria-label="回填到创作面板继续编辑"
                  @click="emit('edit-prompt', turn)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4Z" />
                    <path d="m13.5 6.5 4 4" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="danger"
                  title="删除这轮对话记录，不删除作品库图片"
                  aria-label="删除这轮对话记录，不删除作品库图片"
                  @click="emit('delete-conversation', turn)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 7h14" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M8 7l1-2h6l1 2" />
                    <path d="M7 7l1 13h8l1-13" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <span class="generation-chat-avatar">我</span>
        </div>
        <div class="generation-chat-message assistant">
          <span class="generation-chat-avatar assistant">AI</span>
          <div
            class="generation-chat-bubble generation-chat-assistant-bubble"
            :style="turnPreviewStyle(turn)"
          >
            <div class="generation-chat-response-head">
              <div class="generation-chat-response-title">
                <span class="generation-chat-response-tag">AI 回复</span>
                <b>{{ turnStatusText(turn) }}</b>
              </div>
              <small>{{ turnTime(turn) }}</small>
            </div>
            <div class="generation-chat-response-meta">
              {{ turnMeta(turn) }}
            </div>
            <div
              v-if="turn.status === 'running' || turn.images?.length"
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
                <div v-else class="generation-chat-image-placeholder">
                  <span class="generation-live-spinner"></span>
                  <b>正在生成中...</b>
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
                title="按这轮对话重新生成"
                aria-label="按这轮对话重新生成"
                @click="emit('regenerate-conversation', turn)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M17 3l4 4-4 4" />
                  <path d="M3 11V9a2 2 0 0 1 2-2h16" />
                  <path d="M7 21l-4-4 4-4" />
                  <path d="M21 13v2a2 2 0 0 1-2 2H3" />
                </svg>
              </button>
              <button
                v-if="turn.imagePaths?.length || turn.folder"
                type="button"
                :title="`在文件夹中显示：${turn.imagePaths?.[0] || turn.folder}`"
                aria-label="在文件夹中显示生成图片"
                @click="emit('open-conversation-folder', turn)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M3 7.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Z"
                  />
                  <path d="M3 7.5V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1.5" />
                  <path d="m12 12 2 2-2 2" />
                  <path d="M8 14h6" />
                </svg>
              </button>
            </div>
            <div
              v-if="turn.status !== 'running' && !turn.images?.length"
              class="generation-chat-result-empty"
            >
              <span>{{
                turn.status === 'error'
                  ? '生成失败'
                  : turn.status === 'cancelled'
                    ? '已取消'
                    : '未生成图片'
              }}</span>
            </div>
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
    <div
      v-else
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
      <div v-if="dragActive" class="library-drop-overlay">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v12" />
          <path d="m8 9 4-4 4 4" />
          <path d="M5 19h14" />
        </svg>
        <b>松手即可导入图片</b>
        <small>支持 JPG、PNG、WEBP，可一次拖入多张</small>
      </div>
      <div
        v-for="(column, columnIndex) in galleryLoading || !gallery.length
          ? []
          : galleryColumns"
        :key="columnIndex"
        class="library-gallery-column"
      >
        <article
          v-for="item in column"
          :key="item.path"
          class="gallery-card"
          :class="{ selected: isSelected(item.path) }"
        >
          <button
            v-if="gallerySelectionMode"
            type="button"
            class="gallery-card-check"
            :class="{ selected: isSelected(item.path) }"
            :aria-pressed="isSelected(item.path)"
            :aria-label="isSelected(item.path) ? '取消勾选' : '勾选图片'"
            @click.stop="emit('toggle-selection', item)"
          >
            <span></span>
          </button>
          <img
            :src="item.data"
            :alt="item.name"
            @click="
              gallerySelectionMode
                ? emit('toggle-selection', item)
                : emit('preview', { type: 'gallery', item })
            "
            @contextmenu="
              emit('context-menu', $event, item.data, item.path, true)
            "
          />
          <div class="gallery-card-meta">
            <b>{{ item.name }}</b
            ><small>{{ item.date }}</small>
          </div>
        </article>
      </div>
      <div v-if="galleryLoading" class="gallery-loading" role="status">
        <span class="gallery-loading-spinner"></span><b>正在加载作品库</b
        ><small>正在读取本地图片，请稍候</small>
      </div>
      <div v-else-if="!gallery.length" class="empty-state">
        <span>✧</span>
        <b>
          {{
            galleryFilterDate === 'all'
              ? '作品库还是空的'
              : '这个日期还没有作品'
          }}
        </b>
        <small>
          {{
            galleryFilterDate === 'all'
              ? '生成的图片会自动出现在这里'
              : '切回“全部”可以查看其他日期的作品，也可以继续生成新的图片'
          }}
        </small>
        <em v-if="galleryFilterDate === 'all'" class="gallery-empty-drop-hint">
          可点击右侧“导入”，也可以直接把图片拖到作品库里
        </em>
      </div>
    </div>
  </section>
</template>
