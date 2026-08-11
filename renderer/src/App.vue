<script setup>
import { ref, computed } from 'vue';
const prompt = ref(''),
  ratio = ref('16:9'),
  count = ref(1),
  reference = ref([]),
  images = ref([]),
  status = ref(''),
  busy = ref(false),
  endpoint = ref('https://www.zexitongxue.com'),
  model = ref('gpt-image-2'),
  apiKey = ref(localStorage.getItem('loomora-key') || '');
const ratios = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2'];
const counter = computed(() => `${prompt.value.length}/800`);
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
async function generate() {
  if (!prompt.value.trim()) {
    status.value = '请先描述你的创意';
    return;
  }
  busy.value = true;
  status.value = '正在织造画面…';
  const r = await window.forge.generate({
    endpoint: endpoint.value,
    apiKey: apiKey.value,
    model: model.value,
    prompt: prompt.value,
    aspect: ratio.value,
    count: count.value,
    reference: reference.value,
  });
  busy.value = false;
  if (!r.ok) {
    status.value = r.error;
    return;
  }
  images.value = r.images || [];
  status.value = r.folder ? `已保存至 ${r.folder}` : '创作完成';
}
</script>
<template>
  <div class="app-shell">
    <div class="aurora a1"></div>
    <div class="aurora a2"></div>
    <header class="topbar">
      <div class="brand"><span class="brand-mark">✦</span><b>Loomora</b></div>
      <nav><a class="active">AI 创作</a><a>作品库</a><a>灵感广场</a></nav>
      <button class="config-btn" @click="save">保存配置</button>
    </header>
    <main>
      <section class="intro">
        <div class="eyebrow">✦ Loomora · 织光成画 ✦</div>
        <h1>把灵感变成画面</h1>
        <p>loom light into images.</p>
        <small>灵感落笔处，光芒渐次生</small>
      </section>
      <section class="create-card">
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
            ><span>批量抽卡</span>
            <div class="stepper">
              <button @click="count = Math.max(1, count - 1)">−</button
              ><b>{{ count }}</b
              ><button @click="count = Math.min(9, count + 1)">＋</button>
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
      <section class="works">
        <div class="works-head">
          <div>
            <span class="section-kicker">灵感作品</span>
            <h2>{{ images.length ? '本次创作' : '等待灵感降临' }}</h2>
          </div>
          <span>{{
            images.length ? `${images.length} 张作品` : '生成的图片将在这里展示'
          }}</span>
        </div>
        <div class="gallery" :class="{ empty: !images.length }">
          <img v-for="src in images" :key="src" :src="src" />
          <div v-if="!images.length" class="empty-state">
            <span>✧</span><b>织一束光，生成第一幅作品</b
            ><small>输入提示词，也可以添加一张参考图</small>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
