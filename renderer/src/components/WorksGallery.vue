<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  view: { type: String, required: true },
  conversationHistory: { type: Array, default: () => [] },
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
]);
const dragActive = ref(false);
const batchActive = computed(
  () =>
    props.view === 'create' &&
    props.liveActive &&
    props.generationMode === 'batch' &&
    !props.images.length,
);
const streamActive = computed(
  () =>
    props.view === 'create' &&
    props.generationMode !== 'batch' &&
    (props.liveActive || props.liveImage),
);
const generationTotal = computed(() =>
  Math.max(1, Number(props.liveProgress?.total) || props.images.length || 1),
);
const createHeadText = computed(() => {
  if (props.conversationHistory.length) {
    return `${props.conversationHistory.length} 轮创作对话，可向上回看历史`;
  }
  if (batchActive.value) return `抽卡队列已开启，等待 ${generationTotal.value} 张作品`;
  if (streamActive.value) return '单张流式预览中';
  if (props.images.length) return `${props.images.length} 张作品`;
  return '每次生成都会保留为一轮对话';
});
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
  props.galleryFilterDate === 'all' ? '↓ 导出全部' : '↓ 导出当前',
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

function turnMeta(turn) {
  return [
    turn.model,
    turn.ratio,
    turn.resolution,
    turn.quality && turn.quality !== 'auto' ? `质量 ${turn.quality}` : '自动质量',
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

function turnProgressWidth(turn) {
  const total = Number(turn.progress?.total) || Number(turn.count) || 0;
  if (!total) return '12%';
  const completed = Number(turn.progress?.completed) || 0;
  const partial = Math.min(1, Number(turn.progress?.partial) || 0);
  return `${Math.min(100, ((completed + partial) / total) * 100)}%`;
}

function turnSlots(turn) {
  const total = Math.max(1, Number(turn.progress?.total) || Number(turn.count) || 1);
  const completed = Number(turn.progress?.completed) || 0;
  return Array.from({ length: Math.min(10, total) }, (_, index) => ({
    index,
    done: index < completed,
  }));
}
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
    <div class="works-head">
      <div>
        <span class="section-kicker">灵感作品</span>
        <h2>
          {{
            view === 'gallery'
              ? '作品库'
              : conversationHistory.length
                ? '创作对话'
                : '等待灵感降临'
          }}
        </h2>
      </div>
      <div class="works-head-actions">
        <span>{{ view === 'gallery' ? galleryHeadText : createHeadText }}</span>
        <span v-if="view === 'gallery'" class="gallery-drop-hint">
          拖拽图片到作品库即可导入
        </span>
        <button
          v-if="view === 'gallery'"
          class="gallery-select-button"
          :class="{ active: gallerySelectionMode }"
          :disabled="
            galleryLoading || galleryImporting || galleryExporting || !gallery.length
          "
          :title="gallerySelectionMode ? '退出多选' : '进入多选，勾选图片后批量导出'"
          @click="emit('toggle-selection-mode')"
        >
          {{ gallerySelectionMode ? '退出多选' : '多选' }}
        </button>
        <button
          v-if="view === 'gallery'"
          class="gallery-export-button"
          :disabled="
            galleryLoading || galleryImporting || galleryExporting || !gallery.length
          "
          :title="galleryExportCurrentTitle"
          @click="emit('export-current')"
        >
          {{ galleryExportCurrentLabel }}
        </button>
        <button
          v-if="view === 'gallery'"
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
          ↓ 导出已选{{ gallerySelectedCount ? `(${gallerySelectedCount})` : '' }}
        </button>
        <button
          v-if="view === 'gallery'"
          class="gallery-import-button"
          :disabled="galleryLoading || galleryImporting || galleryExporting"
          @click="emit('import')"
        >
          ＋ {{ galleryImporting ? '导入中...' : '导入图片' }}
        </button>
      </div>
    </div>
    <div
      v-if="view === 'create'"
      class="generation-chat"
      :class="{ empty: !conversationHistory.length }"
    >
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
              <b>第 {{ turnIndex + 1 }} 轮</b>
              <small>{{ turnTime(turn) }}</small>
            </div>
            <p>{{ turn.prompt }}</p>
            <small>{{ turnMeta(turn) }}</small>
          </div>
          <span class="generation-chat-avatar">我</span>
        </div>
        <div class="generation-chat-message assistant">
          <span class="generation-chat-avatar assistant">AI</span>
          <div class="generation-chat-bubble generation-chat-assistant-bubble">
            <div class="generation-chat-status">
              <b>{{ turnStatusText(turn) }}</b>
              <small>{{ turnTime(turn) }}</small>
            </div>
            <div
              v-if="turn.status === 'running' && turn.mode === 'stream'"
              class="generation-live-card generation-chat-live-card"
              aria-live="polite"
            >
              <div class="generation-live-media">
                <img
                  v-if="turn.liveImage || liveImage"
                  :src="turn.liveImage || liveImage"
                  :alt="turn.message || liveMessage || '生成中图片'"
                />
                <div v-else class="generation-live-placeholder">
                  <span class="generation-live-spinner"></span>
                  <b>正在连接图片接口</b>
                  <small>流式预览会在这里逐步展开</small>
                </div>
              </div>
              <div class="generation-live-meta">
                <div>
                  <b>{{ turn.message || liveMessage || '生成中…' }}</b>
                  <small>
                    第 {{ (turn.progress?.batchIndex || 0) + 1 }} 张 ·
                    {{ turn.progress?.completed || 0 }}/{{
                      turn.progress?.total || 0
                    }}
                  </small>
                </div>
                <div class="generation-live-bar">
                  <span :style="{ width: turnProgressWidth(turn) }"></span>
                </div>
              </div>
            </div>
            <div
              v-else-if="turn.status === 'running' && turn.mode === 'batch'"
              class="generation-live-card generation-batch-card generation-chat-live-card"
              aria-live="polite"
            >
              <div class="generation-batch-overview">
                <div class="generation-batch-deck" aria-hidden="true">
                  <span></span><span></span><span></span>
                </div>
                <div class="generation-batch-copy">
                  <span class="generation-batch-tag">抽卡队列</span>
                  <b>{{ turn.message || `正在抽取 ${turn.count} 张作品` }}</b>
                  <small>批量模式返回后会一次性落入当前对话和作品库</small>
                </div>
              </div>
              <div class="generation-batch-grid">
                <div
                  v-for="slot in turnSlots(turn)"
                  :key="slot.index"
                  class="generation-batch-slot"
                  :class="{ done: slot.done }"
                >
                  <span class="generation-batch-slot-badge">{{
                    slot.index + 1
                  }}</span>
                  <b>{{
                    slot.done ? '已完成' : slot.index === 0 ? '排队中' : '待返回'
                  }}</b>
                  <small>{{ slot.done ? '已入库' : '等待接口返回' }}</small>
                </div>
              </div>
            </div>
            <div
              v-else-if="turn.images?.length"
              class="generation-chat-images"
              :class="{ single: turn.images.length === 1 }"
            >
              <img
                v-for="(src, index) in turn.images"
                :key="`${turn.id}-${index}`"
                :src="src"
                :alt="`生成图片 ${index + 1}`"
                @click="
                  emit('preview', {
                    type: 'conversation',
                    item: turn.id,
                    index,
                  })
                "
                @contextmenu="
                  emit('context-menu', $event, src, turn.imagePaths?.[index])
                "
              />
              <small v-if="turn.folder" class="generation-chat-save-note">
                已保存到 {{ turn.folder }}
              </small>
            </div>
            <div v-else class="generation-chat-result-empty">
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
        <b>释放以导入图片</b>
        <small>支持 JPG、PNG 和 WEBP，可同时导入多张</small>
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
          {{ galleryFilterDate === 'all' ? '作品库还是空的' : '这个日期还没有作品' }}
        </b>
        <small>
          {{
            galleryFilterDate === 'all'
              ? '生成的图片会自动出现在这里'
              : '切回“全部”可以查看其他日期的作品，也可以继续生成新的图片'
          }}
        </small>
        <em v-if="galleryFilterDate === 'all'" class="gallery-empty-drop-hint">
          可点击右上角“导入图片”，也可以把图片直接拖拽到作品库区域
        </em>
      </div>
    </div>
  </section>
</template>
