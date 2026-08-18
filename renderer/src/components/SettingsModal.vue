<script setup>
import { nextTick, ref, watch } from 'vue';
import {
  Eye,
  EyeOff,
  FolderOpen,
  HardDriveDownload,
  HardDriveUpload,
  Keyboard,
  RotateCcw,
  Save,
  ServerCog,
  Trash2,
  X,
} from 'lucide-vue-next';

const props = defineProps({
  open: Boolean,
  endpoint: { type: String, required: true },
  apiKey: { type: String, required: true },
  providerProfiles: { type: Array, default: () => [] },
  activeProfileId: { type: String, default: '' },
  profileName: { type: String, default: '' },
  providerId: { type: String, default: 'openai-compatible' },
  providerOptions: { type: Array, default: () => [] },
  model: { type: String, default: 'gpt-image-2' },
  storagePath: { type: String, default: '' },
  defaultStoragePath: { type: String, default: '' },
  saving: Boolean,
  clearing: Boolean,
  backupBusy: Boolean,
  shortcuts: { type: Object, default: () => ({}) },
  isMac: Boolean,
});
const emit = defineEmits([
  'close',
  'save',
  'clear-data',
  'create-backup',
  'restore-backup',
  'profile-change',
  'profile-create',
  'profile-delete',
]);
const profileDraftId = ref(props.activeProfileId);
const endpointDraft = ref(props.endpoint);
const apiKeyDraft = ref(props.apiKey);
const profileNameDraft = ref(props.profileName);
const modelDraft = ref(props.model);
const providerDraft = ref(props.providerId);
const apiKeyVisible = ref(false);
const storageDraft = ref(props.storagePath);
const choosingStorage = ref(false);
const storageError = ref('');
const shortcutDraft = ref({ ...props.shortcuts });
const capturingShortcut = ref('');
const shortcutError = ref('');
const shortcutButtons = ref({});
const shortcutOptions = [
  { key: 'create', label: '返回创作页' },
  { key: 'gallery', label: '打开作品库' },
  { key: 'favorite', label: '收藏当前图片' },
  { key: 'viewPrompt', label: '查看当前提示词' },
  { key: 'copyPrompt', label: '复制当前提示词' },
  { key: 'deleteImage', label: '删除当前图片' },
  { key: 'previousImage', label: '上一张图片' },
  { key: 'nextImage', label: '下一张图片' },
];

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    endpointDraft.value = props.endpoint;
    apiKeyDraft.value = props.apiKey;
    profileDraftId.value = props.activeProfileId;
    profileNameDraft.value = props.profileName;
    modelDraft.value = props.model;
    providerDraft.value = props.providerId;
    storageDraft.value = props.storagePath;
    shortcutDraft.value = structuredClone(props.shortcuts || {});
    apiKeyVisible.value = false;
    storageError.value = '';
    shortcutError.value = '';
    capturingShortcut.value = '';
  },
);

watch(
  () => props.profileName,
  (value) => {
    if (props.open) profileNameDraft.value = value;
  },
);

watch(
  () => props.model,
  (value) => {
    if (props.open) modelDraft.value = value;
  },
);

watch(
  () => props.providerId,
  (value) => {
    if (props.open) providerDraft.value = value;
  },
);

watch(
  () => props.activeProfileId,
  (value) => {
    if (props.open) profileDraftId.value = value;
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

function changeProfile(event) {
  profileDraftId.value = event.target.value;
  emit('profile-change', profileDraftId.value);
}

function shortcutText(binding = {}) {
  const parts = [];
  if (binding.mod) parts.push(props.isMac ? 'Command' : 'Ctrl');
  if (binding.ctrl) parts.push('Ctrl');
  if (binding.meta) parts.push('Command');
  if (binding.alt) parts.push(props.isMac ? 'Option' : 'Alt');
  if (binding.shift) parts.push('Shift');
  const codeLabels = {
    Delete: 'Delete',
    Backspace: 'Backspace',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
  };
  parts.push(
    codeLabels[binding.code] ||
      String(binding.code || '')
        .replace(/^Key/, '')
        .replace(/^Digit/, ''),
  );
  return parts.filter(Boolean).join(' + ');
}

function startShortcutCapture(key) {
  capturingShortcut.value = key;
  shortcutError.value = '';
  nextTick(() => shortcutButtons.value[key]?.focus());
}

function captureShortcut(event, key) {
  if (capturingShortcut.value !== key) return;
  event.preventDefault();
  event.stopPropagation();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
  const code = String(event.code || '');
  if (
    !/^(Key[A-Z]|Digit[0-9]|Arrow(Left|Right|Up|Down)|Delete|Backspace|F([1-9]|1[0-2]))$/.test(
      code,
    )
  ) {
    shortcutError.value = '请使用字母、数字、方向键、Delete 或 F1-F12';
    return;
  }
  const binding = {
    code,
    ...(event.ctrlKey ? { ctrl: true } : {}),
    ...(event.metaKey ? { meta: true } : {}),
    ...(event.altKey ? { alt: true } : {}),
    ...(event.shiftKey ? { shift: true } : {}),
  };
  const duplicate = Object.entries(shortcutDraft.value).find(
    ([otherKey, other]) =>
      otherKey !== key && shortcutText(other) === shortcutText(binding),
  );
  if (duplicate) {
    shortcutError.value = `该组合已用于“${shortcutOptions.find((item) => item.key === duplicate[0])?.label || duplicate[0]}”`;
    return;
  }
  shortcutDraft.value = { ...shortcutDraft.value, [key]: binding };
  capturingShortcut.value = '';
  shortcutError.value = '';
}

async function resetShortcutDraft() {
  shortcutDraft.value = await window.forge.resetShortcuts();
  capturingShortcut.value = '';
  shortcutError.value = '';
}
</script>

<template>
  <Transition name="settings-modal">
    <div v-if="open" class="settings-modal-layer">
      <section
        class="settings-modal settings-preferences-modal"
        role="dialog"
        aria-modal="true"
        aria-label="生图服务设置"
        @click.stop
      >
        <header>
          <div><b>生图服务设置</b><span>管理不同平台的服务配置</span></div>
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
              <div><b>服务配置</b><span>连接当前选择的生图平台</span></div>
            </div>
            <div class="provider-profile-row">
              <label>
                <span>当前服务</span>
                <select :value="profileDraftId" @change="changeProfile">
                  <option
                    v-for="profile in providerProfiles"
                    :key="profile.id"
                    :value="profile.id"
                  >
                    {{ profile.name }}
                  </option>
                </select>
              </label>
              <div class="provider-profile-actions">
                <button
                  type="button"
                  title="新建服务"
                  @click="emit('profile-create')"
                >
                  新建
                </button>
                <button
                  v-if="providerProfiles.length > 1"
                  type="button"
                  title="删除当前服务"
                  @click="emit('profile-delete', profileDraftId)"
                >
                  删除
                </button>
              </div>
            </div>
            <label>
              <span>服务名称</span>
              <input v-model="profileNameDraft" placeholder="未命名服务" />
            </label>
            <label>
              <span>服务类型</span>
              <select v-model="providerDraft">
                <option
                  v-for="provider in providerOptions"
                  :key="provider.id"
                  :value="provider.id"
                >
                  {{ provider.label }}
                </option>
              </select>
            </label>
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
            <label>
              <span>默认模型</span>
              <input v-model="modelDraft" placeholder="gpt-image-2" />
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
          <section class="settings-group local-data-settings">
            <div class="settings-group-title">
              <HardDriveDownload aria-hidden="true" />
              <div><b>备份与恢复</b><span>迁移本地作品与作品信息</span></div>
            </div>
            <div class="local-data-action settings-backup-action">
              <span>备份包不包含 API Key，可在 Windows 与 macOS 间恢复。</span>
              <div class="settings-backup-buttons">
                <button
                  type="button"
                  :disabled="saving || clearing || backupBusy"
                  @click="$emit('restore-backup')"
                >
                  <HardDriveUpload aria-hidden="true" />恢复备份
                </button>
                <button
                  type="button"
                  :disabled="saving || clearing || backupBusy"
                  @click="$emit('create-backup')"
                >
                  <HardDriveDownload aria-hidden="true" />{{
                    backupBusy ? '处理中...' : '创建备份'
                  }}
                </button>
              </div>
            </div>
          </section>
          <section class="settings-group shortcut-settings">
            <div class="settings-group-title">
              <Keyboard aria-hidden="true" />
              <div><b>快捷键</b><span>点击键位后直接按下新的组合</span></div>
            </div>
            <div class="shortcut-settings-grid">
              <div v-for="item in shortcutOptions" :key="item.key">
                <span>{{ item.label }}</span>
                <button
                  :ref="(element) => (shortcutButtons[item.key] = element)"
                  type="button"
                  :class="{ capturing: capturingShortcut === item.key }"
                  @click="startShortcutCapture(item.key)"
                  @keydown="captureShortcut($event, item.key)"
                >
                  {{
                    capturingShortcut === item.key
                      ? '请按新快捷键'
                      : shortcutText(shortcutDraft[item.key])
                  }}
                </button>
              </div>
            </div>
            <div class="shortcut-settings-footer">
              <span>{{ shortcutError }}</span>
              <button type="button" @click="resetShortcutDraft">
                <RotateCcw aria-hidden="true" />恢复默认
              </button>
            </div>
          </section>
          <section class="settings-group local-data-settings">
            <div class="settings-group-title">
              <Trash2 aria-hidden="true" />
              <div>
                <b>本地数据</b><span>管理此设备保存的 Loomora 数据</span>
              </div>
            </div>
            <div class="local-data-action">
              <span
                >清除作品、创作历史、参考图缓存、接口配置和首次使用状态。</span
              >
              <button
                type="button"
                :disabled="saving || clearing"
                @click="$emit('clear-data')"
              >
                <Trash2 aria-hidden="true" />清除本地数据
              </button>
            </div>
          </section>
        </div>
        <footer>
          <button
            type="button"
            class="settings-cancel"
            :disabled="saving || clearing || backupBusy"
            @click="$emit('close')"
          >
            取消
          </button>
          <button
            type="button"
            class="settings-save"
            :disabled="saving || choosingStorage || clearing || backupBusy"
            @click="
              $emit(
                'save',
                endpointDraft,
                apiKeyDraft,
                storageDraft,
                shortcutDraft,
                {
                  profileId: profileDraftId,
                  profileName: profileNameDraft,
                  providerId: providerDraft,
                  model: modelDraft,
                },
              )
            "
          >
            <Save aria-hidden="true" />{{ saving ? '正在保存...' : '保存配置' }}
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>
