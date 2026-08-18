<script setup>
import { computed, ref, watch } from 'vue';
import { History, RotateCcw, X } from 'lucide-vue-next';

const props = defineProps({
  open: Boolean,
  versions: { type: Array, default: () => [] },
  currentPath: { type: String, default: '' },
  restoring: Boolean,
});

const emit = defineEmits(['close', 'restore']);
const leftPath = ref('');
const rightPath = ref('');
const leftVersion = computed(() =>
  props.versions.find((item) => item.path === leftPath.value),
);
const rightVersion = computed(() =>
  props.versions.find((item) => item.path === rightPath.value),
);

watch(
  () => [props.open, props.versions, props.currentPath],
  () => {
    if (!props.open || !props.versions.length) return;
    leftPath.value = props.versions[0].path;
    rightPath.value =
      props.versions.find((item) => item.path === props.currentPath)?.path ||
      props.versions.at(-1).path;
  },
  { immediate: true },
);
</script>

<template>
  <Transition name="compare-modal">
    <div v-if="open" class="image-compare-layer">
      <section role="dialog" aria-modal="true" aria-label="作品版本对比">
        <header>
          <div><History aria-hidden="true" /><b>版本对比</b></div>
          <button
            type="button"
            title="关闭版本对比"
            aria-label="关闭版本对比"
            :disabled="restoring"
            @click="$emit('close')"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div class="image-compare-content">
          <article>
            <label>
              <span>对比版本</span>
              <select v-model="leftPath">
                <option
                  v-for="version in versions"
                  :key="version.path"
                  :value="version.path"
                >
                  第 {{ version.version }} 版 · {{ version.name }}
                </option>
              </select>
            </label>
            <img
              v-if="leftVersion"
              :src="leftVersion.image"
              :alt="leftVersion.name"
            />
          </article>
          <article>
            <label>
              <span>当前版本</span>
              <select v-model="rightPath">
                <option
                  v-for="version in versions"
                  :key="version.path"
                  :value="version.path"
                >
                  第 {{ version.version }} 版 · {{ version.name }}
                </option>
              </select>
            </label>
            <img
              v-if="rightVersion"
              :src="rightVersion.image"
              :alt="rightVersion.name"
            />
          </article>
        </div>
        <footer>
          <span>恢复操作会另存为新版本，现有文件不会被覆盖。</span>
          <button
            type="button"
            :disabled="restoring || !leftVersion"
            @click="$emit('restore', leftVersion)"
          >
            <RotateCcw aria-hidden="true" />
            {{ restoring ? '正在恢复...' : '恢复左侧版本' }}
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>
