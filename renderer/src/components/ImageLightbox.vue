<script setup>
defineProps({
  preview: { type: Object, required: true },
  currentItem: { type: Object, required: true },
  ocrBusy: Boolean,
});
defineEmits(['close', 'previous', 'next', 'recognize', 'edit', 'context-menu']);
</script>

<template>
  <div
    class="lightbox"
    role="dialog"
    aria-modal="true"
  >
    <div class="lightbox-actions">
      <button
        class="lightbox-ocr"
        :disabled="ocrBusy"
        title="识别图片中的文字"
        @click="$emit('recognize')"
      >
        {{ ocrBusy ? '识别中...' : '识别文字' }}
      </button>
      <button
        v-if="currentItem.editable && currentItem.filePath"
        class="lightbox-edit"
        title="编辑图片"
        @click="$emit('edit')"
      >
        编辑
      </button>
    </div>
    <button
      v-if="preview.items.length > 1"
      class="lightbox-nav lightbox-prev"
      title="上一张"
      @click="$emit('previous')"
    >
      ‹
    </button>
    <button
      v-if="preview.items.length > 1"
      class="lightbox-nav lightbox-next"
      title="下一张"
      @click="$emit('next')"
    >
      ›
    </button>
    <button
      class="lightbox-close"
      title="关闭预览"
      aria-label="关闭预览"
      @click="$emit('close')"
    >
      ×
    </button>
    <figure>
      <img
        :src="currentItem.src"
        :alt="currentItem.name"
        @contextmenu="
          $emit(
            'context-menu',
            $event,
            currentItem.src,
            currentItem.filePath,
            currentItem.editable,
          )
        "
      />
      <figcaption>
        {{ currentItem.name }} · {{ preview.index + 1 }} /
        {{ preview.items.length }}
      </figcaption>
    </figure>
  </div>
</template>
