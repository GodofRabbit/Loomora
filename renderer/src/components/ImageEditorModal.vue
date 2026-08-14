<script setup>
import { ref } from 'vue';

defineProps({
  source: { type: Object, default: null },
  status: { type: String, default: '' },
  saving: Boolean,
  ocrBusy: Boolean,
});
const emit = defineEmits(['recognize', 'close', 'save']);
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
        <button
          :disabled="saving || ocrBusy"
          title="识别当前画面中的文字"
          @click="emit('recognize')"
        >
          {{ ocrBusy ? '识别中...' : '文字识别' }}
        </button>
        <button :disabled="saving" @click="emit('save')">
          {{ saving ? '保存中...' : '另存为新图' }}
        </button>
        <button :disabled="saving" @click="emit('close')">取消</button>
      </div>
    </header>
    <div ref="host" class="image-editor-host"></div>
  </div>
</template>
