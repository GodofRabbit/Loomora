<script setup>
import { ref } from 'vue';

defineProps({
  view: { type: String, required: true },
  images: { type: Array, required: true },
  imagePaths: { type: Array, required: true },
  gallery: { type: Array, required: true },
  galleryColumns: { type: Array, required: true },
  galleryColumnCount: { type: Number, required: true },
  galleryLoading: Boolean,
  galleryImporting: Boolean,
});
const emit = defineEmits(['preview', 'context-menu', 'import', 'import-drop']);
const dragActive = ref(false);

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
</script>

<template>
  <section
    class="works"
    :class="{
      'library-view': view === 'gallery',
      'library-loading-view': view === 'gallery' && galleryLoading,
    }"
  >
    <div class="works-head">
      <div>
        <span class="section-kicker">灵感作品</span>
        <h2>
          {{
            view === 'gallery'
              ? '作品库'
              : images.length
                ? '本次创作'
                : '等待灵感降临'
          }}
        </h2>
      </div>
      <div class="works-head-actions">
        <span>{{
          view === 'gallery'
            ? galleryLoading
              ? '正在读取本地作品...'
              : `${gallery.length} 张本地作品`
            : images.length
              ? `${images.length} 张作品`
              : '生成的图片将在这里展示'
        }}</span>
        <button
          v-if="view === 'gallery'"
          class="gallery-import-button"
          :disabled="galleryLoading || galleryImporting"
          @click="emit('import')"
        >
          ＋ {{ galleryImporting ? '导入中...' : '导入图片' }}
        </button>
      </div>
    </div>
    <div
      v-if="view === 'create'"
      class="gallery"
      :class="{ empty: !images.length }"
    >
      <img
        v-for="(src, index) in images"
        :key="src"
        :src="src"
        @click="emit('preview', { type: 'create', index })"
        @contextmenu="emit('context-menu', $event, src, imagePaths[index])"
      />
      <div v-if="!images.length" class="empty-state">
        <span class="create-empty-icon">✧</span><b>织一束光，生成第一幅作品</b
        ><small>输入提示词，也可以添加一张参考图</small>
      </div>
    </div>
    <div
      v-else
      class="gallery library-gallery"
      :style="{ '--library-column-count': galleryColumnCount }"
      :class="{
        empty: galleryLoading || !gallery.length,
        loading: galleryLoading,
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
        <article v-for="item in column" :key="item.path" class="gallery-card">
          <img
            :src="item.data"
            :alt="item.name"
            @click="emit('preview', { type: 'gallery', item })"
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
        <span>✧</span><b>作品库还是空的</b
        ><small>生成的图片会自动出现在这里</small>
      </div>
    </div>
  </section>
</template>
