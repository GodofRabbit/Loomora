<script setup>
import { computed, ref, watch } from 'vue';
import { FolderHeart, Save, Tags, X } from 'lucide-vue-next';
import DropdownSelect from './DropdownSelect.vue';

const props = defineProps({
  open: Boolean,
  count: { type: Number, default: 0 },
  albums: { type: Array, default: () => [] },
  tags: { type: Array, default: () => [] },
  mode: { type: String, default: 'batch' },
  initialAlbum: { type: String, default: '' },
  initialTags: { type: Array, default: () => [] },
  initialColor: { type: String, default: '' },
  busy: Boolean,
});

const emit = defineEmits(['close', 'save']);
const albumDraft = ref('');
const tagsDraft = ref('');
const selectedTags = ref([]);
const colorDraft = ref('keep');
const colorOptions = [
  { value: 'keep', label: '保持原色' },
  { value: '', label: '清除颜色' },
  { value: 'red', label: '红色' },
  { value: 'gold', label: '金色' },
  { value: 'green', label: '绿色' },
  { value: 'blue', label: '蓝色' },
  { value: 'purple', label: '紫色' },
];
const singleMode = computed(() => props.mode === 'single');
const visibleColorOptions = computed(() =>
  singleMode.value
    ? colorOptions.filter((option) => option.value !== 'keep')
    : colorOptions,
);
const availableTags = computed(() =>
  Array.from(new Set([...props.tags, ...selectedTags.value])),
);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    albumDraft.value = singleMode.value ? props.initialAlbum : '';
    tagsDraft.value = '';
    selectedTags.value = singleMode.value ? [...props.initialTags] : [];
    colorDraft.value = singleMode.value ? props.initialColor : 'keep';
  },
);

function toggleTag(tag) {
  selectedTags.value = selectedTags.value.includes(tag)
    ? selectedTags.value.filter((item) => item !== tag)
    : [...selectedTags.value, tag];
}

function save() {
  const typedTags = tagsDraft.value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
  emit('save', {
    album: albumDraft.value.trim(),
    tags: Array.from(new Set([...selectedTags.value, ...typedTags])),
    colorLabel: colorDraft.value,
  });
}
</script>

<template>
  <Transition name="settings-modal">
    <div v-if="open" class="settings-modal-layer">
      <section
        class="settings-modal gallery-organize-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="singleMode ? '整理作品' : '批量整理作品'"
        @click.stop
      >
        <header>
          <div>
            <b>{{ singleMode ? '整理作品' : '批量整理' }}</b
            ><span>{{
              singleMode ? '快速修改分类信息' : `已选择 ${count} 张作品`
            }}</span>
          </div>
          <button
            type="button"
            :title="singleMode ? '关闭整理' : '关闭批量整理'"
            :aria-label="singleMode ? '关闭整理' : '关闭批量整理'"
            :disabled="busy"
            @click="$emit('close')"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div class="settings-modal-body gallery-organize-body">
          <div class="gallery-organize-field">
            <span><FolderHeart aria-hidden="true" />加入专辑</span>
            <DropdownSelect
              :model-value="albumDraft"
              :options="albums"
              editable
              :max-length="80"
              placeholder="输入新专辑或选择已有专辑"
              aria-label="选择或输入专辑"
              @update:model-value="albumDraft = $event"
            />
          </div>
          <label>
            <span
              ><Tags aria-hidden="true" />{{
                singleMode ? '标签' : '追加标签'
              }}</span
            >
            <input
              v-model="tagsDraft"
              maxlength="400"
              placeholder="多个标签使用逗号分隔"
            />
          </label>
          <div v-if="availableTags.length" class="gallery-organize-tags">
            <button
              v-for="tag in availableTags"
              :key="tag"
              type="button"
              :class="{ active: selectedTags.includes(tag) }"
              :aria-pressed="selectedTags.includes(tag)"
              @click="toggleTag(tag)"
            >
              {{ tag }}
            </button>
          </div>
          <fieldset class="gallery-organize-colors">
            <legend>颜色标记</legend>
            <button
              v-for="option in visibleColorOptions"
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
        </div>
        <footer>
          <button
            type="button"
            class="settings-cancel"
            :disabled="busy"
            @click="$emit('close')"
          >
            取消
          </button>
          <button
            type="button"
            class="settings-save"
            :disabled="busy"
            @click="save"
          >
            <Save aria-hidden="true" />{{ busy ? '保存中...' : '应用整理' }}
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>
