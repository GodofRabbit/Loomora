<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
const prompt = ref(''),
  ratio = ref('16:9'),
  count = ref(1),
  reference = ref([]),
  images = ref([]),
  gallery = ref([]),
  preview = ref(null),
  view = ref('create'),
  status = ref(''),
  busy = ref(false),
  endpoint = ref('https://www.zexitongxue.com'),
  model = ref('gpt-image-2'),
  resolution = ref('2048x1152'),
  quality = ref('auto'),
  apiKey = ref(localStorage.getItem('loomora-key') || '');
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
const modelIsGpt = computed(
  () => model.value === 'gpt-image-2' || /^dall-e(?:-|$)/.test(model.value),
);
const modelIsGemini = computed(
  () =>
    model.value.startsWith('gemini-') || model.value.startsWith('nano-banana'),
);
const counter = computed(() => `${prompt.value.length}/800`);
function closePreview() {
  preview.value = null;
}
function previewItems() {
  return view.value === 'gallery'
    ? gallery.value.map((item) => ({ src: item.data, name: item.name }))
    : images.value.map((src, index) => ({
        src,
        name: `Generated image ${index + 1}`,
      }));
}
function openPreview(item, index = 0) {
  preview.value = { items: previewItems(), index };
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
  if (event.key === 'Escape') closePreview();
  if (preview.value && event.key === 'ArrowLeft') movePreview(-1);
  if (preview.value && event.key === 'ArrowRight') movePreview(1);
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
async function openGallery() {
  view.value = 'gallery';
  gallery.value = await window.forge.listGallery();
}
async function pick() {
  if (reference.value.length >= 14) {
    status.value = '最多添加 14 张参考图';
    return;
  }
  const r = await window.forge.pickImage();
  if (r) reference.value.push(r);
}
function removeRef(i) {
  reference.value.splice(i, 1);
}
function save() {
  localStorage.setItem('loomora-key', apiKey.value);
  status.value = '配置已保存';
}
async function generateSequential() {
  if (!prompt.value.trim()) {
    status.value = '请先描述你的创意';
    return;
  }
  busy.value = true;
  status.value = '正在织造画面…';
  const total = Math.max(1, Number(count.value) || 1);
  const generated = [];
  let folder = '';
  try {
    for (let i = 0; i < total; i++) {
      status.value = `Generating ${i + 1} / ${total}`;
      const r = await window.forge.generate({
        endpoint: endpoint.value,
        apiKey: apiKey.value,
        model: model.value,
        prompt: prompt.value,
        aspect: ratio.value,
        size: resolution.value,
        quality: quality.value,
        count: 1,
        // IPC 只能传输可结构化克隆的普通对象，避免把 Vue reactive proxy 传给主进程。
        reference: reference.value.map(({ name, data }) => ({ name, data })),
      });
      if (!r.ok) throw new Error(`Image ${i + 1} failed: ${r.error}`);
      generated.push(...(r.images || []));
      folder = r.folder || folder;
      images.value = [...generated];
    }
  } catch (e) {
    status.value = e?.message || String(e);
    return;
  } finally {
    busy.value = false;
  }
  status.value = folder ? `Saved to ${folder}` : 'Generation complete';
}
async function generate() {
  if (!prompt.value.trim()) {
    status.value = 'Please enter a prompt';
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
    if (!result.ok || result.failedCount) {
      status.value = result.error || 'Generation failed';
      return;
    }
    const folder = result.folder;
    status.value = folder ? `Saved to ${folder}` : 'Generation complete';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="app-shell">
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
            <button @click="pick">
              ▧ 添加参考图（{{ reference.length }}/14）</button
            ><span>{{ counter }}</span>
          </div>
        </div>
        <div v-if="reference.length" class="reference-list">
          <div
            v-for="(item, i) in reference"
            :key="item.name + i"
            class="reference"
          >
            <img :src="item.data" /><span>{{ item.name }}</span
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
        <img :src="currentPreview.src" :alt="currentPreview.name" />
        <figcaption>
          {{ currentPreview.name }} · {{ preview.index + 1 }} /
          {{ preview.items.length }}
        </figcaption>
      </figure>
    </div>
  </div>
</template>
