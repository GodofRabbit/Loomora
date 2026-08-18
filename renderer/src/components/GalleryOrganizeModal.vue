<script setup>
import { ref, watch } from 'vue';
import { FolderHeart, Save, Tags, X } from 'lucide-vue-next';

const props = defineProps({
  open: Boolean,
  count: { type: Number, default: 0 },
  albums: { type: Array, default: () => [] },
  tags: { type: Array, default: () => [] },
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

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    albumDraft.value = '';
    tagsDraft.value = '';
    selectedTags.value = [];
    colorDraft.value = 'keep';
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
        aria-label="批量整理作品"
        @click.stop
      >
        <header>
          <div>
            <b>批量整理</b><span>已选择 {{ count }} 张作品</span>
          </div>
          <button
            type="button"
            title="关闭批量整理"
            aria-label="关闭批量整理"
            :disabled="busy"
            @click="$emit('close')"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div class="settings-modal-body gallery-organize-body">
          <label>
            <span><FolderHeart aria-hidden="true" />加入专辑</span>
            <input
              v-model="albumDraft"
              list="gallery-album-options"
              maxlength="80"
              placeholder="输入新专辑或选择已有专辑"
            />
            <datalist id="gallery-album-options">
              <option v-for="album in albums" :key="album" :value="album" />
            </datalist>
          </label>
          <label>
            <span><Tags aria-hidden="true" />追加标签</span>
            <input
              v-model="tagsDraft"
              maxlength="400"
              placeholder="多个标签使用逗号分隔"
            />
          </label>
          <div v-if="tags.length" class="gallery-organize-tags">
            <button
              v-for="tag in tags"
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
