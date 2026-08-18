<script setup>
import { computed, ref, watch } from 'vue';
import {
  ArrowLeft,
  CircleAlert,
  Copy,
  FileText,
  FolderHeart,
  FolderOpen,
  GitCompare,
  LoaderCircle,
  Palette,
  Pencil,
  Save,
  Sparkles,
  Tags,
  X,
} from 'lucide-vue-next';

const props = defineProps({
  open: Boolean,
  loading: Boolean,
  saving: Boolean,
  details: { type: Object, default: null },
  error: { type: String, default: '' },
});

const emit = defineEmits([
  'close',
  'copy',
  'use',
  'save',
  'compare',
  'open-location',
]);
const editing = ref(false);
const titleDraft = ref('');
const promptDraft = ref('');
const albumDraft = ref('');
const tagsDraft = ref('');
const noteDraft = ref('');
const colorDraft = ref('');
const colorOptions = [
  { value: '', label: '无颜色' },
  { value: 'red', label: '红色' },
  { value: 'gold', label: '金色' },
  { value: 'green', label: '绿色' },
  { value: 'blue', label: '蓝色' },
  { value: 'purple', label: '紫色' },
];

function resetDrafts() {
  const details = props.details || {};
  titleDraft.value = details.title || '';
  promptDraft.value = details.prompt || '';
  albumDraft.value = details.album || '';
  tagsDraft.value = Array.isArray(details.tags) ? details.tags.join('，') : '';
  noteDraft.value = details.note || '';
  colorDraft.value = details.colorLabel || '';
}

function startEditing() {
  resetDrafts();
  editing.value = true;
}

function cancelEditing() {
  editing.value = false;
  resetDrafts();
}

function handleHeaderClose() {
  if (editing.value) {
    cancelEditing();
    return;
  }
  emit('close');
}

function saveDrafts() {
  emit('save', {
    title: titleDraft.value,
    prompt: promptDraft.value,
    album: albumDraft.value,
    tags: tagsDraft.value,
    note: noteDraft.value,
    colorLabel: colorDraft.value,
  });
}

watch(
  () => [props.open, props.details],
  () => {
    editing.value = false;
    resetDrafts();
  },
  { immediate: true },
);

const sourceLabel = computed(() => {
  const labels = {
    inspiration: '灵感广场',
    generated: '生成作品',
    edited: '编辑作品',
    manual: '本地作品',
  };
  return labels[props.details?.source] || '本地作品';
});

const colorLabel = computed(
  () =>
    colorOptions.find((option) => option.value === props.details?.colorLabel)
      ?.label || '未设置',
);

const metadataRows = computed(() => {
  const details = props.details || {};
  const rows = [
    ['模型', details.model],
    ['画面比例', details.ratio],
    ['分辨率', details.resolution],
    ['质量', details.quality],
    ['格式', String(details.outputFormat || '').toUpperCase()],
    ['分类', details.tag],
    ['氛围', details.mood],
  ];
  if (Number(details.createdAt)) {
    rows.push([
      '生成时间',
      new Date(Number(details.createdAt)).toLocaleString('zh-CN'),
    ]);
  }
  if (details.width && details.height) {
    rows.push(['图片尺寸', `${details.width} × ${details.height}`]);
  }
  if (Number(details.fileSize)) {
    const size = Number(details.fileSize);
    rows.push([
      '文件大小',
      size >= 1024 * 1024
        ? `${(size / 1024 / 1024).toFixed(2)} MB`
        : `${Math.max(1, Math.round(size / 1024))} KB`,
    ]);
  }
  if (details.version > 1) rows.push(['作品版本', `第 ${details.version} 版`]);
  if (details.filePath) rows.push(['存储位置', details.filePath]);
  return rows.filter(([, value]) => String(value || '').trim());
});
</script>

<template>
  <Transition name="prompt-drawer">
    <div
      v-if="open"
      class="prompt-drawer-layer"
      @click.self="handleHeaderClose"
    >
      <aside
        class="prompt-details-panel"
        role="dialog"
        aria-modal="true"
        aria-label="图片提示词"
        @click.stop
      >
        <header>
          <div class="prompt-details-heading">
            <span><FileText aria-hidden="true" /></span>
            <div>
              <b>图片提示词</b>
              <small>{{ details?.name || sourceLabel }}</small>
            </div>
          </div>
          <div class="prompt-details-header-actions">
            <button
              v-if="details?.filePath && !loading && !editing"
              type="button"
              title="编辑作品信息"
              aria-label="编辑作品信息"
              @click="startEditing"
            >
              <Pencil aria-hidden="true" />
            </button>
            <button
              type="button"
              :title="editing ? '返回图片信息' : '关闭提示词'"
              :aria-label="editing ? '返回图片信息' : '关闭提示词'"
              @click="handleHeaderClose"
            >
              <ArrowLeft v-if="editing" aria-hidden="true" />
              <X v-else aria-hidden="true" />
            </button>
          </div>
        </header>

        <div class="prompt-details-body">
          <div v-if="loading" class="prompt-details-state" role="status">
            <LoaderCircle class="prompt-details-spinner" aria-hidden="true" />
            <b>正在读取提示词</b>
          </div>
          <div v-else-if="error" class="prompt-details-state error">
            <CircleAlert aria-hidden="true" />
            <b>提示词读取失败</b>
            <small>{{ error }}</small>
          </div>
          <div v-else-if="editing" class="prompt-details-edit-form">
            <label>
              <span>作品标题</span>
              <input v-model="titleDraft" maxlength="160" />
            </label>
            <label>
              <span>提示词</span>
              <textarea v-model="promptDraft" maxlength="32000"></textarea>
            </label>
            <div class="prompt-details-edit-row">
              <label>
                <span>专辑</span>
                <input v-model="albumDraft" maxlength="80" />
              </label>
              <label>
                <span>标签</span>
                <input
                  v-model="tagsDraft"
                  maxlength="400"
                  placeholder="使用逗号分隔"
                />
              </label>
            </div>
            <fieldset>
              <legend>颜色标记</legend>
              <button
                v-for="option in colorOptions"
                :key="option.value || 'none'"
                type="button"
                :class="[
                  `color-${option.value || 'none'}`,
                  { active: colorDraft === option.value },
                ]"
                :title="option.label"
                :aria-label="option.label"
                :aria-pressed="colorDraft === option.value"
                @click="colorDraft = option.value"
              ></button>
            </fieldset>
            <label>
              <span>备注</span>
              <textarea
                v-model="noteDraft"
                class="prompt-details-note"
                maxlength="8000"
              ></textarea>
            </label>
          </div>
          <template v-else>
            <div v-if="details?.image" class="prompt-details-image">
              <img :src="details.image" :alt="details.name || '作品预览'" />
              <span>{{ sourceLabel }}</span>
            </div>

            <section
              v-if="details?.filePath"
              class="prompt-details-organization"
              aria-label="作品整理信息"
            >
              <dl>
                <div>
                  <dt><FolderHeart aria-hidden="true" />专辑</dt>
                  <dd
                    :class="{ empty: !details.album }"
                    :title="details.album || '未设置'"
                  >
                    {{ details.album || '未设置' }}
                  </dd>
                </div>
                <div>
                  <dt><Tags aria-hidden="true" />标签</dt>
                  <dd
                    class="prompt-details-organization-tags"
                    :class="{ empty: !details.tags?.length }"
                    :title="details.tags?.join('、') || '未设置'"
                  >
                    {{ details.tags?.join('、') || '未设置' }}
                  </dd>
                </div>
                <div>
                  <dt><Palette aria-hidden="true" />颜色</dt>
                  <dd :class="{ empty: !details.colorLabel }">
                    <i
                      class="prompt-details-organization-color"
                      :class="`color-${details.colorLabel || 'none'}`"
                      aria-hidden="true"
                    ></i>
                    {{ colorLabel }}
                  </dd>
                </div>
              </dl>
            </section>

            <div v-if="details?.prompt" class="prompt-details-content">
              <div class="prompt-details-label">
                <span>完整提示词</span>
                <b>{{ details.prompt.length }} 字符</b>
              </div>
              <p>{{ details.prompt }}</p>
            </div>
            <div v-else class="prompt-details-state empty">
              <FileText aria-hidden="true" />
              <b>未关联提示词</b>
              <small>导入图片或较早保存的编辑图片可能没有提示词记录</small>
            </div>

            <dl v-if="metadataRows.length" class="prompt-details-metadata">
              <div v-for="([label, value], index) in metadataRows" :key="index">
                <dt>{{ label }}</dt>
                <dd>
                  <button
                    v-if="label === '存储位置'"
                    type="button"
                    class="prompt-details-path-button"
                    title="打开文件所在位置"
                    @click="$emit('open-location')"
                  >
                    <FolderOpen aria-hidden="true" />
                    <span>{{ value }}</span>
                  </button>
                  <template v-else>{{ value }}</template>
                </dd>
              </div>
            </dl>
            <div v-if="details?.note" class="prompt-details-note-view">
              <b>备注</b>
              <p>{{ details.note }}</p>
            </div>
          </template>
        </div>

        <footer
          :class="{
            editing,
            'has-compare': !editing && details?.versions?.length > 1,
          }"
        >
          <template v-if="editing">
            <button
              type="button"
              class="prompt-copy-button"
              :disabled="saving"
              @click="cancelEditing"
            >
              取消
            </button>
            <button
              type="button"
              class="prompt-use-button"
              :disabled="saving"
              @click="saveDrafts"
            >
              <LoaderCircle v-if="saving" class="prompt-details-spinner" />
              <Save v-else aria-hidden="true" />
              {{ saving ? '保存中...' : '保存信息' }}
            </button>
          </template>
          <button
            v-else-if="details?.versions?.length > 1"
            type="button"
            class="prompt-compare-button"
            @click="$emit('compare')"
          >
            <GitCompare aria-hidden="true" />版本对比
          </button>
          <button
            v-if="!editing"
            type="button"
            class="prompt-copy-button"
            :disabled="loading || !details?.prompt"
            @click="$emit('copy')"
          >
            <Copy aria-hidden="true" />复制提示词
          </button>
          <button
            v-if="!editing"
            type="button"
            class="prompt-use-button"
            :disabled="loading || !details?.prompt"
            @click="$emit('use')"
          >
            <Sparkles aria-hidden="true" />重新创作
          </button>
        </footer>
      </aside>
    </div>
  </Transition>
</template>
