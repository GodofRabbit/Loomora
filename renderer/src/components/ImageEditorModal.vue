<script setup>
import { ref } from 'vue';

defineProps({
  source: { type: Object, default: null },
  status: { type: String, default: '' },
  saving: Boolean,
  mosaicActive: Boolean,
  mosaicSize: { type: Number, default: 28 },
  ocrBusy: Boolean,
});
const emit = defineEmits([
  'toggle-mosaic',
  'update:mosaic-size',
  'recognize',
  'close',
  'save',
]);
const host = ref(null);
defineExpose({ host });
</script>

<template>
  <div
    v-if="source"
    class="image-editor-modal"
    role="dialog"
    aria-modal="true"
    aria-label="图片编辑器"
  >
    <header class="image-editor-toolbar">
      <div>
        <b>编辑图片</b>
        <span>{{ source.name }}</span>
      </div>
      <span class="image-editor-status">{{ status }}</span>
      <div class="image-editor-actions">
        <label class="mosaic-size-control" title="调整马赛克笔刷大小">
          <span>笔刷</span>
          <input
            :value="mosaicSize"
            type="range"
            min="12"
            max="72"
            step="2"
            @input="emit('update:mosaic-size', Number($event.target.value))"
          />
          <b>{{ mosaicSize }}px</b>
        </label>
        <button
          class="mosaic-toggle"
          :class="{ active: mosaicActive }"
          :disabled="saving"
          title="拖动涂抹局部区域"
          @click="emit('toggle-mosaic')"
        >
          {{ mosaicActive ? '关闭马赛克' : '马赛克' }}
        </button>
        <button
          class="ocr-editor-button"
          :disabled="saving || ocrBusy"
          title="识别当前画面中的文字"
          @click="emit('recognize')"
        >
          {{ ocrBusy ? '识别中...' : '文字识别' }}
        </button>
        <button :disabled="saving" @click="emit('close')">取消</button>
        <button
          class="save-edited-image"
          :disabled="saving"
          @click="emit('save')"
        >
          {{ saving ? '保存中...' : '另存为新图' }}
        </button>
      </div>
    </header>
    <div ref="host" class="image-editor-host"></div>
  </div>
</template>
