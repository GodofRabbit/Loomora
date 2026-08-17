<script setup>
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Pencil,
  ScanText,
  X,
} from 'lucide-vue-next';

defineProps({
  preview: { type: Object, required: true },
  currentItem: { type: Object, required: true },
  ocrBusy: Boolean,
});
defineEmits(['close', 'previous', 'next', 'recognize', 'edit', 'context-menu']);
</script>

<template>
  <div class="lightbox" role="dialog" aria-modal="true">
    <div class="lightbox-actions">
      <button
        type="button"
        class="lightbox-ocr"
        :disabled="ocrBusy"
        title="识别图片中的文字"
        @click="$emit('recognize')"
      >
        <LoaderCircle
          v-if="ocrBusy"
          class="lightbox-action-loading"
          aria-hidden="true"
        />
        <ScanText v-else aria-hidden="true" />
        {{ ocrBusy ? '识别中...' : '识别文字' }}
      </button>
      <button
        v-if="currentItem.editable && currentItem.filePath"
        type="button"
        class="lightbox-edit"
        title="编辑图片"
        @click="$emit('edit')"
      >
        <Pencil aria-hidden="true" />编辑图片
      </button>
    </div>
    <button
      v-if="preview.items.length > 1"
      type="button"
      class="lightbox-nav lightbox-prev"
      title="上一张"
      aria-label="上一张"
      @click="$emit('previous')"
    >
      <ChevronLeft aria-hidden="true" />
    </button>
    <button
      v-if="preview.items.length > 1"
      type="button"
      class="lightbox-nav lightbox-next"
      title="下一张"
      aria-label="下一张"
      @click="$emit('next')"
    >
      <ChevronRight aria-hidden="true" />
    </button>
    <button
      type="button"
      class="lightbox-close"
      title="关闭预览"
      aria-label="关闭预览"
      @click="$emit('close')"
    >
      <X aria-hidden="true" />
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
