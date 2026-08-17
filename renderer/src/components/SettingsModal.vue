<script setup>
import { ref, watch } from 'vue';
import {
  Eye,
  EyeOff,
  FolderOpen,
  RotateCcw,
  Save,
  ServerCog,
  X,
} from 'lucide-vue-next';

const props = defineProps({
  open: Boolean,
  endpoint: { type: String, required: true },
  apiKey: { type: String, required: true },
  storagePath: { type: String, default: '' },
  defaultStoragePath: { type: String, default: '' },
  saving: Boolean,
});
const emit = defineEmits(['close', 'save']);
const endpointDraft = ref(props.endpoint);
const apiKeyDraft = ref(props.apiKey);
const apiKeyVisible = ref(false);
const storageDraft = ref(props.storagePath);
const choosingStorage = ref(false);
const storageError = ref('');

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    endpointDraft.value = props.endpoint;
    apiKeyDraft.value = props.apiKey;
    storageDraft.value = props.storagePath;
    apiKeyVisible.value = false;
    storageError.value = '';
  },
);

watch(
  () => props.storagePath,
  (value) => {
    if (props.open) storageDraft.value = value;
  },
);

async function chooseStorageDirectory() {
  if (choosingStorage.value) return;
  choosingStorage.value = true;
  storageError.value = '';
  try {
    const result = await window.forge.chooseGalleryStorage(storageDraft.value);
    if (!result?.canceled && result?.directory) {
      storageDraft.value = result.directory;
    }
  } catch {
    storageError.value = '无法打开目录选择器，请稍后重试';
  } finally {
    choosingStorage.value = false;
  }
}

function restoreDefaultStorage() {
  storageDraft.value = props.defaultStoragePath;
}
</script>

<template>
  <Transition name="settings-modal">
    <div v-if="open" class="settings-modal-layer">
      <section
        class="settings-modal settings-preferences-modal"
        role="dialog"
        aria-modal="true"
        aria-label="接口设置"
        @click.stop
      >
        <header>
          <div><b>接口设置</b><span>配置 OpenAI 兼容接口</span></div>
          <button
            type="button"
            title="关闭设置"
            aria-label="关闭设置"
            @click="$emit('close')"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div class="settings-modal-body settings-preferences-body">
          <section class="settings-group">
            <div class="settings-group-title">
              <ServerCog aria-hidden="true" />
              <div><b>接口配置</b><span>连接 OpenAI 兼容服务</span></div>
            </div>
            <label
              ><span>接口地址</span
              ><input
                v-model="endpointDraft"
                placeholder="https://api.openai.com"
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
                  <EyeOff v-if="apiKeyVisible" aria-hidden="true" />
                  <Eye v-else aria-hidden="true" />
                </button>
              </div>
            </label>
          </section>
          <section class="settings-group">
            <div class="settings-group-title">
              <FolderOpen aria-hidden="true" />
              <div><b>本地存储</b><span>作品与创作历史使用同一目录</span></div>
            </div>
            <label>
              <span>保存位置</span>
              <div class="storage-path-row">
                <input :value="storageDraft" readonly title="作品存储目录" />
                <button
                  type="button"
                  class="storage-browse-button"
                  :disabled="choosingStorage || saving"
                  title="选择保存位置"
                  @click="chooseStorageDirectory"
                >
                  <FolderOpen aria-hidden="true" />选择
                </button>
              </div>
            </label>
            <div class="storage-setting-note">
              <span
                >切换后，新作品和历史记录写入新目录，原目录内容仍会继续显示。</span
              >
              <button
                type="button"
                :disabled="storageDraft === defaultStoragePath || saving"
                @click="restoreDefaultStorage"
              >
                <RotateCcw aria-hidden="true" />恢复默认
              </button>
            </div>
            <p v-if="storageError" class="storage-setting-error">
              {{ storageError }}
            </p>
          </section>
        </div>
        <footer>
          <button
            type="button"
            class="settings-cancel"
            :disabled="saving"
            @click="$emit('close')"
          >
            取消
          </button>
          <button
            type="button"
            class="settings-save"
            :disabled="saving || choosingStorage"
            @click="$emit('save', endpointDraft, apiKeyDraft, storageDraft)"
          >
            <Save aria-hidden="true" />{{ saving ? '正在保存...' : '保存配置' }}
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>
