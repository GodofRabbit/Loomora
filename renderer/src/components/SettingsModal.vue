<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  open: Boolean,
  endpoint: { type: String, required: true },
  apiKey: { type: String, required: true },
});
const emit = defineEmits(['close', 'save']);
const endpointDraft = ref(props.endpoint);
const apiKeyDraft = ref(props.apiKey);
const apiKeyVisible = ref(false);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    endpointDraft.value = props.endpoint;
    apiKeyDraft.value = props.apiKey;
    apiKeyVisible.value = false;
  },
);
</script>

<template>
  <Transition name="settings-modal">
    <div v-if="open" class="settings-modal-layer" @click.self="$emit('close')">
      <section
        class="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="接口设置"
        @click.stop
      >
        <header>
          <div><b>接口设置</b><span>配置图片生成服务</span></div>
          <button
            title="关闭设置"
            aria-label="关闭设置"
            @click="$emit('close')"
          >
            ×
          </button>
        </header>
        <div class="settings-modal-body">
          <label
            ><span>网站地址</span
            ><input v-model="endpointDraft" placeholder="API 地址"
          /></label>
          <label>
            <span>API Key</span>
            <div class="api-key-input">
              <input
                v-model="apiKeyDraft"
                :type="apiKeyVisible ? 'text' : 'password'"
                placeholder="请输入 API Key"
              />
              <button
                type="button"
                :title="apiKeyVisible ? '隐藏 API Key' : '显示 API Key'"
                :aria-label="apiKeyVisible ? '隐藏 API Key' : '显示 API Key'"
                @click="apiKeyVisible = !apiKeyVisible"
              >
                <svg
                  v-if="apiKeyVisible"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M3 3l18 18" />
                  <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
                  <path
                    d="M9.9 4.2A10.7 10.7 0 0 1 12 4c5.2 0 9 5.3 9 8a9.6 9.6 0 0 1-2 3.5"
                  />
                  <path
                    d="M6.6 6.6C4.3 8.1 3 10.4 3 12c0 2.7 3.8 8 9 8 1.3 0 2.5-.3 3.6-.8"
                  />
                </svg>
                <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M3 12c0-2.7 3.8-8 9-8s9 5.3 9 8-3.8 8-9 8-9-5.3-9-8Z"
                  />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
          </label>
        </div>
        <footer>
          <button class="settings-cancel" @click="$emit('close')">取消</button>
          <button
            class="settings-save"
            @click="$emit('save', endpointDraft, apiKeyDraft)"
          >
            保存配置
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>
