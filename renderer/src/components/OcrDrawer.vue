<script setup>
defineProps({
  open: Boolean,
  busy: Boolean,
  lines: { type: Array, required: true },
  error: { type: String, default: '' },
  sourceName: { type: String, default: '' },
});
defineEmits(['close', 'copy']);
</script>

<template>
  <Transition name="ocr-drawer">
    <div v-if="open" class="ocr-drawer-layer" @click.self="$emit('close')">
      <aside
        class="ocr-result-panel"
        role="dialog"
        aria-modal="true"
        aria-label="文字识别结果"
        @click.stop
      >
        <header>
          <div>
            <b>文字识别</b><span>{{ sourceName }}</span>
          </div>
          <button
            title="关闭识别结果"
            aria-label="关闭识别结果"
            @click="$emit('close')"
          >
            ×
          </button>
        </header>
        <div class="ocr-result-body">
          <div v-if="busy" class="ocr-result-state" role="status">
            <span class="ocr-spinner"></span><b>正在识别文字</b
            ><small>首次使用需要加载本地识别模型</small>
          </div>
          <div v-else-if="error" class="ocr-result-state ocr-error">
            <span>!</span><b>识别失败</b><small>{{ error }}</small>
          </div>
          <div v-else-if="!lines.length" class="ocr-result-state">
            <span>文</span><b>未识别到文字</b
            ><small>可尝试使用更清晰、文字方向更端正的图片</small>
          </div>
          <div v-else class="ocr-lines">
            <p v-for="(line, index) in lines" :key="index + '-' + line">
              {{ line }}
            </p>
          </div>
        </div>
        <footer>
          <span v-if="lines.length">已识别 {{ lines.length }} 段文字</span
          ><span v-else></span>
          <button :disabled="!lines.length" @click="$emit('copy')">
            复制全部
          </button>
        </footer>
      </aside>
    </div>
  </Transition>
</template>
