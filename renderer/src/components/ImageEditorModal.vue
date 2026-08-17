<script setup>
import { ref } from 'vue';
import { LoaderCircle, Save, ScanText, X } from 'lucide-vue-next';

defineProps({
  source: { type: Object, default: null },
  status: { type: String, default: '' },
  saving: Boolean,
  processing: Boolean,
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
          class="image-editor-action-secondary"
          :disabled="processing || ocrBusy"
          title="识别当前画面中的文字"
          @click="emit('recognize')"
        >
          <LoaderCircle
            v-if="ocrBusy"
            class="image-editor-action-loading"
            aria-hidden="true"
          />
          <ScanText v-else aria-hidden="true" />
          {{ ocrBusy ? '识别中...' : '文字识别' }}
        </button>
        <button
          class="image-editor-action-primary"
          :disabled="processing"
          title="将当前编辑结果另存为新图片"
          @click="emit('save')"
        >
          <LoaderCircle
            v-if="saving"
            class="image-editor-action-loading"
            aria-hidden="true"
          />
          <Save v-else aria-hidden="true" />
          {{ saving ? '保存中...' : '另存为新图' }}
        </button>
        <button
          class="image-editor-action-ghost"
          :disabled="processing"
          title="关闭图片编辑器"
          @click="emit('close')"
        >
          <X aria-hidden="true" />取消
        </button>
      </div>
    </header>
    <div ref="host" class="image-editor-host"></div>
  </div>
</template>
