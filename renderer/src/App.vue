<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
const DEFAULT_ENDPOINT = 'https://www.zexitongxue.com';
const API_KEY_STORAGE = 'loomora-key';
const ENDPOINT_STORAGE = 'loomora-endpoint';
const prompt = ref(''),
  ratio = ref('16:9'),
  count = ref(1),
  reference = ref([]),
  images = ref([]),
  imagePaths = ref([]),
  gallery = ref([]),
  preview = ref(null),
  contextMenu = ref(null),
  scrollContainer = ref(null),
  scrollThumbTop = ref(0),
  scrollThumbHeight = ref(80),
  view = ref('create'),
  status = ref(''),
  busy = ref(false),
  endpoint = ref(localStorage.getItem(ENDPOINT_STORAGE) || DEFAULT_ENDPOINT),
  model = ref('gpt-image-2'),
  resolution = ref('2048x1152'),
  quality = ref('auto'),
  apiKey = ref(localStorage.getItem(API_KEY_STORAGE) || '');
const ratios = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2'];
const gptSizes = [
  '1024x1024',
  '1536x1024',
  '1024x1536',
  '2048x1152',
  '3840x2160',
  '2160x3840',
  'auto',
];
const modelAliases = {
  'dall-e': 'gpt-image-2',
  'dall-e-2': 'gpt-image-2',
  'dall-e-3': 'grok-imagine-image-pro',
  'nano-banana': 'gemini-3.1-flash-image-preview',
  'nano-banana2': 'gemini-3.1-flash-image-preview',
  'nano-banana-2': 'gemini-3.1-flash-image-preview',
  'nano-banana-pro': 'gemini-3-pro-image-preview',
  'grok-imagine-image-quality': 'grok-imagine-image-pro',
};
const normalizedModel = computed(() => {
  const value = model.value.trim();
  return modelAliases[value] || value;
});
const modelIsGpt = computed(() => normalizedModel.value === 'gpt-image-2');
const modelIsGemini = computed(() =>
  normalizedModel.value.startsWith('gemini-'),
);
const maxReferences = computed(() => {
  if (modelIsGpt.value) return 14;
  if (modelIsGemini.value) return 4;
  if (normalizedModel.value === 'grok-imagine-image-edit') return 3;
  if (normalizedModel.value === 'grok-imagine-image-lite') return 0;
  if (normalizedModel.value.startsWith('grok-imagine-image')) return 1;
  return 14;
});
const counter = computed(() => `${prompt.value.length}/800`);
let scrollResizeObserver;
let stopGenerationStatus;
function updateScrollbar() {
  const el = scrollContainer.value;
  if (!el) return;
  const trackHeight = el.clientHeight - 24;
  scrollThumbHeight.value = Math.max(
    48,
    trackHeight * (el.clientHeight / el.scrollHeight),
  );
  const maxTop = trackHeight - scrollThumbHeight.value;
  scrollThumbTop.value =
    el.scrollHeight > el.clientHeight
      ? 12 + maxTop * (el.scrollTop / (el.scrollHeight - el.clientHeight))
      : 12;
}
function startScrollDrag(event) {
  const el = scrollContainer.value;
  const startY = event.clientY;
  const startScroll = el.scrollTop;
  const available = el.clientHeight - 24 - scrollThumbHeight.value;
  const maxScroll = el.scrollHeight - el.clientHeight;
  const move = (moveEvent) => {
    el.scrollTop =
      startScroll + ((moveEvent.clientY - startY) / available) * maxScroll;
  };
  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
}
function closePreview() {
  preview.value = null;
}
function showImageMenu(event, src, filePath = '') {
  event.preventDefault();
  contextMenu.value = { x: event.clientX, y: event.clientY, src, filePath };
}
async function deleteContextImage() {
  if (!contextMenu.value?.filePath) return;
  const { filePath } = contextMenu.value;
  contextMenu.value = null;
  try {
    const result = await window.forge.deleteImage(filePath);
    if (!result.deleted) return;
    const index = imagePaths.value.indexOf(filePath);
    if (index >= 0) {
      imagePaths.value.splice(index, 1);
      images.value.splice(index, 1);
    }
    gallery.value = gallery.value.filter((item) => item.path !== filePath);
    closePreview();
    status.value = 'Image deleted';
  } catch (error) {
    status.value = error?.message || 'Delete failed';
  }
}
async function showContextImageInFolder() {
  if (!contextMenu.value?.filePath) return;
  const { filePath } = contextMenu.value;
  contextMenu.value = null;
  try {
    await window.forge.showImageInFolder(filePath);
  } catch (error) {
    status.value = error?.message || 'Unable to open file location';
  }
}
async function copyContextImage() {
  if (!contextMenu.value) return;
  try {
    await window.forge.copyImage(contextMenu.value.src);
    status.value = 'Image copied';
  } catch (error) {
    status.value = error?.message || 'Copy failed';
  } finally {
    contextMenu.value = null;
  }
}
function previewItems() {
  return view.value === 'gallery'
    ? gallery.value.map((item) => ({
        src: item.data,
        name: item.name,
        filePath: item.path,
      }))
    : images.value.map((src, index) => ({
        src,
        name: `Generated image ${index + 1}`,
        filePath: imagePaths.value[index],
      }));
}
function openPreview(item, index = 0) {
  preview.value = { items: previewItems(), index };
}
function openReferencePreview(index = 0) {
  preview.value = {
    items: reference.value.map((item) => ({
      src: item.data,
      name: item.name,
    })),
    index,
  };
}
function movePreview(step) {
  if (!preview.value?.items.length) return;
  const total = preview.value.items.length;
  preview.value.index = (preview.value.index + step + total) % total;
}
const currentPreview = computed(
  () => preview.value?.items[preview.value.index],
);
function onKeydown(event) {
  if (event.key === 'Escape') {
    contextMenu.value = null;
    closePreview();
  }
  if (preview.value && event.key === 'ArrowLeft') movePreview(-1);
  if (preview.value && event.key === 'ArrowRight') movePreview(1);
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', updateScrollbar);
  scrollResizeObserver = new ResizeObserver(updateScrollbar);
  scrollResizeObserver.observe(scrollContainer.value);
  scrollResizeObserver.observe(scrollContainer.value.querySelector('main'));
  stopGenerationStatus = window.forge?.onGenerationStatus?.((message) => {
    status.value = message;
  });
  nextTick(updateScrollbar);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('resize', updateScrollbar);
  scrollResizeObserver?.disconnect();
  stopGenerationStatus?.();
});
async function openGallery() {
  view.value = 'gallery';
  gallery.value = await window.forge.listGallery();
}
async function pick() {
  if (reference.value.length >= maxReferences.value) {
    status.value = `${normalizedModel.value} 最多添加 ${maxReferences.value} 张参考图`;
    return;
  }
  const r = await window.forge.pickImage();
  if (r) reference.value.push(r);
}
function removeRef(i) {
  reference.value.splice(i, 1);
}
function save() {
  endpoint.value = endpoint.value.trim() || DEFAULT_ENDPOINT;
  apiKey.value = apiKey.value.trim();
  localStorage.setItem(API_KEY_STORAGE, apiKey.value);
  localStorage.setItem(ENDPOINT_STORAGE, endpoint.value);
  status.value = '配置已保存';
}
async function generate() {
  if (!prompt.value.trim()) {
    status.value = 'Please enter a prompt';
    return;
  }
  if (!apiKey.value.trim()) {
    status.value = 'Please enter an API Key';
    return;
  }
  if (reference.value.length > maxReferences.value) {
    status.value = `${normalizedModel.value} 最多支持 ${maxReferences.value} 张参考图`;
    return;
  }
  if (!window.forge?.generate) {
    status.value = 'Request bridge unavailable. Please restart Loomora.';
    return;
  }
  busy.value = true;
  const total = Math.min(4, Math.max(1, Number(count.value) || 1));
  status.value = `Generating ${total} image${total > 1 ? 's' : ''}`;
  const request = {
    endpoint: endpoint.value,
    apiKey: apiKey.value,
    model: model.value,
    prompt: prompt.value,
    aspect: ratio.value,
    size: resolution.value,
    quality: quality.value,
    count: total,
    reference: reference.value.map(({ name, data }) => ({ name, data })),
  };
  try {
    const result = await window.forge.generate(request);
    images.value = result.images || [];
    imagePaths.value = result.localPaths || [];
    if (!result.ok || result.failedCount) {
      status.value = result.error || 'Generation failed';
      return;
    }
    const folder = result.folder;
    status.value = folder ? `Saved to ${folder}` : 'Generation complete';
  } catch (error) {
    status.value = error?.message || 'Unable to send generation request';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div
    ref="scrollContainer"
    class="app-shell"
    @scroll="updateScrollbar"
    @click="contextMenu = null"
  >
    <div class="aurora a1"></div>
    <div class="aurora a2"></div>
    <header class="topbar">
      <div class="brand"><span class="brand-mark">✦</span><b>Loomora</b></div>
      <nav>
        <a :class="{ active: view === 'create' }" @click="view = 'create'"
          >AI 创作</a
        ><a :class="{ active: view === 'gallery' }" @click="openGallery"
          >作品库</a
        ><a>灵感广场</a>
      </nav>
      <button class="config-btn" @click="save">保存配置</button>
    </header>
    <main>
      <section v-if="view === 'create'" class="intro">
        <div class="eyebrow">✦ Loomora · 织光成画 ✦</div>
        <h1>把灵感变成画面</h1>
        <p>loom light into images.</p>
        <small>灵感落笔处，光芒渐次生</small>
      </section>
      <section v-if="view === 'create'" class="create-card">
        <div class="card-title">
          <div>
            <span>✦</span>
            <h2>快速创作</h2>
          </div>
          <span class="status">{{ status || '准备就绪' }}</span>
        </div>
        <div class="prompt-box">
          <textarea
            v-model="prompt"
            maxlength="800"
            placeholder="描述你的创意画面，例如：金色晨曦洒在云海之上，未来城市与自然共生"
          ></textarea>
          <div class="prompt-tools">
            <button :disabled="maxReferences === 0" @click="pick">
              ▧ 添加参考图（{{ reference.length }}/{{ maxReferences }}）</button
            ><span>{{ counter }}</span>
          </div>
        </div>
        <div v-if="reference.length" class="reference-list">
          <div
            v-for="(item, i) in reference"
            :key="item.name + i"
            class="reference"
          >
            <img
              :src="item.data"
              :alt="item.name"
              title="点击查看大图"
              @click="openReferencePreview(i)"
            /><span>{{ item.name }}</span
            ><button @click="removeRef(i)">×</button>
          </div>
        </div>
        <div class="control-row">
          <label><span>模型选择</span><input v-model="model" /></label
          ><label
            ><span>画面比例</span
            ><select v-model="ratio">
              <option v-for="r in ratios" :key="r">{{ r }}</option>
            </select></label
          ><label
            ><span>Resolution</span
            ><select v-model="resolution">
              <template v-if="modelIsGpt"
                ><option v-for="s in gptSizes" :key="s">
                  {{ s }}
                </option></template
              >
              <template v-else
                ><option v-for="r in ratios" :key="r">{{ r }}</option></template
              >
            </select></label
          ><label v-if="modelIsGpt || modelIsGemini"
            ><span>Quality</span
            ><select v-model="quality">
              <template v-if="modelIsGpt"
                ><option>auto</option>
                <option>low</option>
                <option>medium</option>
                <option>high</option></template
              >
              <template v-else
                ><option>1K</option>
                <option>2K</option>
                <option>4K</option></template
              >
            </select></label
          ><label
            ><span>批量抽卡</span>
            <div class="stepper">
              <button @click="count = Math.max(1, count - 1)">−</button
              ><b>{{ count }}</b
              ><button @click="count = Math.min(4, count + 1)">＋</button>
            </div></label
          ><button class="generate" :disabled="busy" @click="generate">
            ✦ {{ busy ? '生成中…' : '生成' }}
          </button>
        </div>
        <details>
          <summary>接口设置</summary>
          <div class="settings">
            <input v-model="endpoint" placeholder="API 地址" /><input
              v-model="apiKey"
              type="password"
              placeholder="API Key"
            />
          </div>
        </details>
      </section>
      <section class="works" :class="{ 'library-view': view === 'gallery' }">
        <div class="works-head">
          <div>
            <span class="section-kicker">灵感作品</span>
            <h2>
              {{
                view === 'gallery'
                  ? '作品库'
                  : images.length
                    ? '本次创作'
                    : '等待灵感降临'
              }}
            </h2>
          </div>
          <span>{{
            view === 'gallery'
              ? `${gallery.length} 张本地作品`
              : images.length
                ? `${images.length} 张作品`
                : '生成的图片将在这里展示'
          }}</span>
        </div>
        <div
          v-if="view === 'create'"
          class="gallery"
          :class="{ empty: !images.length }"
        >
          <img
            v-for="src in images"
            :key="src"
            :src="src"
            @click="openPreview(src, images.indexOf(src))"
            @contextmenu="
              showImageMenu($event, src, imagePaths[images.indexOf(src)])
            "
          />
          <div v-if="!images.length" class="empty-state">
            <span>✧</span><b>织一束光，生成第一幅作品</b
            ><small>输入提示词，也可以添加一张参考图</small>
          </div>
        </div>
        <div
          v-else
          class="gallery library-gallery"
          :class="{ empty: !gallery.length }"
        >
          <article
            v-for="item in gallery"
            :key="item.path"
            class="gallery-card"
          >
            <img
              :src="item.data"
              :alt="item.name"
              @click="openPreview(item, gallery.indexOf(item))"
              @contextmenu="showImageMenu($event, item.data, item.path)"
            />
            <div class="gallery-card-meta">
              <b>{{ item.name }}</b
              ><small>{{ item.date }}</small>
            </div>
          </article>
          <div v-if="!gallery.length" class="empty-state">
            <span>✧</span><b>作品库还是空的</b
            ><small>生成的图片会自动出现在这里</small>
          </div>
        </div>
      </section>
    </main>
    <div
      v-if="preview"
      class="lightbox"
      role="dialog"
      aria-modal="true"
      @click.self="closePreview"
    >
      <button
        v-if="preview && preview.items.length > 1"
        class="lightbox-nav lightbox-prev"
        title="Previous image"
        @click="movePreview(-1)"
      >
        ‹
      </button>
      <button
        v-if="preview && preview.items.length > 1"
        class="lightbox-nav lightbox-next"
        title="Next image"
        @click="movePreview(1)"
      >
        ›
      </button>
      <button
        class="lightbox-close"
        title="Close preview"
        aria-label="Close preview"
        @click="closePreview"
      >
        ×
      </button>
      <figure>
        <img
          :src="currentPreview.src"
          :alt="currentPreview.name"
          @contextmenu="
            showImageMenu($event, currentPreview.src, currentPreview.filePath)
          "
        />
        <figcaption>
          {{ currentPreview.name }} · {{ preview.index + 1 }} /
          {{ preview.items.length }}
        </figcaption>
      </figure>
    </div>
    <div
      v-if="contextMenu"
      class="image-context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <button @click="copyContextImage"><span>▣</span>复制</button>
      <button v-if="contextMenu.filePath" @click="showContextImageInFolder">
        <span>↗</span>打开文件所在位置
      </button>
      <button
        v-if="contextMenu.filePath"
        class="danger"
        @click="deleteContextImage"
      >
        <span>×</span>删除
      </button>
    </div>
    <div class="custom-scrollbar" aria-hidden="true">
      <div
        class="custom-scrollbar-thumb"
        :style="{
          height: `${scrollThumbHeight}px`,
          top: `${scrollThumbTop}px`,
        }"
        @pointerdown.prevent="startScrollDrag"
      ></div>
    </div>
  </div>
</template>
