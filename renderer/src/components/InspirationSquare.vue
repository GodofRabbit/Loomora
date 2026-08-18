<script setup>
import { computed, ref } from 'vue';
import { MessageSquareText, Search } from 'lucide-vue-next';
import { inspirationCards } from '../data/inspirations';
import { distributeGalleryItems } from '../utils/gallery';

const props = defineProps({
  columnCount: { type: Number, default: 4 },
});

const emit = defineEmits([
  'use-prompt',
  'use-reference',
  'view-prompt',
  'preview',
]);

const search = ref('');
const activeTag = ref('全部');
const failedImages = ref(new Set());

const tags = computed(() => [
  '全部',
  ...Array.from(new Set(inspirationCards.map((card) => card.tag))),
]);

const normalizedSearch = computed(() => search.value.trim().toLowerCase());

const filteredItems = computed(() =>
  inspirationCards
    .filter(
      (card) => activeTag.value === '全部' || activeTag.value === card.tag,
    )
    .filter((card) => {
      if (!normalizedSearch.value) return true;
      const haystack = `${card.title} ${card.tag} ${card.mood} ${card.prompt}`;
      return haystack.toLowerCase().includes(normalizedSearch.value);
    }),
);

const columns = computed(() =>
  distributeGalleryItems(
    filteredItems.value,
    Math.max(2, Math.min(4, Number(props.columnCount) || 4)),
  ),
);

const previewItems = computed(() =>
  filteredItems.value.map((item) => ({
    src: item.image,
    name: item.title,
    editable: false,
    prompt: item.prompt,
    source: 'inspiration',
    ratio: item.ratio,
    resolution: item.resolution,
    tag: item.tag,
    mood: item.mood,
  })),
);

function previewItem(item) {
  const index = filteredItems.value.findIndex((entry) => entry.id === item.id);
  emit('preview', {
    type: 'direct',
    items: previewItems.value,
    index: Math.max(0, index),
  });
}

function clearSearch() {
  search.value = '';
  activeTag.value = '全部';
}

function markImageFailed(id) {
  failedImages.value = new Set([...failedImages.value, id]);
}

function ratioStyle(ratio) {
  const [width, height] = String(ratio || '')
    .split(':')
    .map(Number);
  if (!width || !height) return {};
  return { '--inspiration-ratio': `${width} / ${height}` };
}
</script>

<template>
  <section class="inspiration-square">
    <div class="inspiration-sticky">
      <div class="inspiration-head">
        <div>
          <span class="section-kicker">Inspiration Square</span>
          <h1>灵感广场</h1>
        </div>
        <div class="inspiration-search">
          <Search aria-hidden="true" />
          <input
            v-model="search"
            type="search"
            placeholder="搜索人像、产品、海报或画面氛围"
            aria-label="搜索灵感"
          />
        </div>
      </div>

      <div class="inspiration-toolbar" aria-label="灵感分类">
        <button
          v-for="tag in tags"
          :key="tag"
          type="button"
          :class="{ active: activeTag === tag }"
          @click="activeTag = tag"
        >
          {{ tag }}
        </button>
      </div>
    </div>

    <div class="inspiration-scroll">
      <div
        v-if="filteredItems.length"
        class="inspiration-board"
        :style="{ '--inspiration-column-count': columns.length }"
      >
        <div
          v-for="(column, columnIndex) in columns"
          :key="columnIndex"
          class="inspiration-column"
        >
          <article
            v-for="item in column"
            :key="item.id"
            class="inspiration-card local-inspiration-card"
          >
            <button
              type="button"
              class="inspiration-card-media"
              :style="ratioStyle(item.ratio)"
              title="查看灵感图"
              @click="previewItem(item)"
            >
              <img
                v-if="!failedImages.has(item.id)"
                :src="item.image"
                :alt="item.imageAlt"
                loading="lazy"
                @error="markImageFailed(item.id)"
              />
              <i v-else>图片加载失败</i>
              <span>{{ item.tag }}</span>
              <b>{{ item.ratio }}</b>
            </button>
            <div class="inspiration-card-body">
              <small>{{ item.mood }}</small>
              <h2>{{ item.title }}</h2>
              <p>{{ item.prompt }}</p>
              <div class="inspiration-card-actions">
                <button
                  type="button"
                  class="inspiration-prompt-button"
                  title="查看完整提示词"
                  aria-label="查看完整提示词"
                  @click="emit('view-prompt', item)"
                >
                  <MessageSquareText aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title="填入快速创作"
                  @click="emit('use-prompt', item)"
                >
                  用此灵感创作
                </button>
                <button
                  type="button"
                  title="使用本地图片作为参考图创作"
                  @click="emit('use-reference', item)"
                >
                  作为参考图创作
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>

      <div v-else class="inspiration-empty">
        <b>没有匹配的灵感</b>
        <p>换个关键词，或清空筛选重新浏览。</p>
        <div>
          <button type="button" @click="clearSearch">清空筛选</button>
        </div>
      </div>
    </div>
  </section>
</template>
