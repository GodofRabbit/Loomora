<script setup>
import { nextTick, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';

const props = defineProps({
  open: Boolean,
  name: { type: String, required: true },
});
const emit = defineEmits(['close', 'save']);
const nameDraft = ref(props.name);
const nameInput = ref(null);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    nameDraft.value = props.name;
    nextTick(() => {
      nameInput.value?.focus?.();
      nameInput.value?.select?.();
    });
  },
);
</script>

<template>
  <Transition name="settings-modal">
    <div v-if="open" class="settings-modal-layer">
      <section
        class="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="重命名图片"
        @click.stop
      >
        <header>
          <div><b>重命名图片</b><span>修改本地作品文件名</span></div>
          <button
            type="button"
            title="关闭重命名"
            aria-label="关闭重命名"
            @click="$emit('close')"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div class="settings-modal-body">
          <label>
            <span>文件名</span>
            <input
              ref="nameInput"
              v-model="nameDraft"
              placeholder="请输入新文件名"
              @keydown.enter.prevent="$emit('save', nameDraft)"
            />
            <small class="rename-hint">
              可不填后缀；若填写后缀，仅支持 PNG、JPG、JPEG、WEBP
            </small>
          </label>
        </div>
        <footer>
          <button type="button" class="settings-cancel" @click="$emit('close')">
            取消
          </button>
          <button
            type="button"
            class="settings-save"
            @click="$emit('save', nameDraft)"
          >
            重命名
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>
