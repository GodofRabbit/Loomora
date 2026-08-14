<script setup>
import DropdownSelect from './DropdownSelect.vue';

defineProps({
  prompt: { type: String, required: true },
  reference: { type: Array, required: true },
  model: { type: String, required: true },
  ratio: { type: String, required: true },
  resolution: { type: String, required: true },
  quality: { type: String, required: true },
  counter: { type: String, required: true },
  modelOptions: { type: Array, required: true },
  ratioOptions: { type: Array, required: true },
  resolutionOptions: { type: Array, required: true },
  qualityOptions: { type: Array, required: true },
  maxReferences: { type: Number, required: true },
  maxCount: { type: Number, required: true },
  count: { type: Number, required: true },
  modelIsGpt: Boolean,
  modelIsGemini: Boolean,
  busy: Boolean,
});
const emit = defineEmits([
  'update:prompt',
  'update:model',
  'update:ratio',
  'update:resolution',
  'update:quality',
  'update:count',
  'pick-reference',
  'remove-reference',
  'preview-reference',
  'generate',
]);
</script>

<template>
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
      <span class="status"><slot name="status">准备就绪</slot></span>
    </div>
    <div class="prompt-box">
      <textarea
        :value="prompt"
        maxlength="800"
        placeholder="描述你的创意画面，例如：金色晨曦洒在云海之上，未来城市与自然共生"
        @input="emit('update:prompt', $event.target.value)"
      ></textarea>
      <div class="prompt-tools">
        <button :disabled="maxReferences === 0" @click="emit('pick-reference')">
          <svg
            class="reference-upload-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <rect x="3.5" y="4" width="14" height="16" rx="2" />
            <circle cx="8" cy="9" r="1.5" />
            <path d="m5.5 17 3.5-3.5 2.5 2.5 2-2 2.5 2.5" />
            <path d="M19 8v7M15.5 11.5h7" />
          </svg>
          添加参考图（{{ reference.length }}/{{ maxReferences }}）
        </button>
        <span>{{ counter }}</span>
      </div>
    </div>
    <div v-if="reference.length" class="reference-list">
      <div
        v-for="(item, index) in reference"
        :key="item.name + index"
        class="reference"
      >
        <img
          :src="item.data"
          :alt="item.name"
          title="点击查看大图"
          @click="emit('preview-reference', index)"
        />
        <span>{{ item.name }}</span>
        <button @click="emit('remove-reference', index)">×</button>
      </div>
    </div>
    <div class="control-row">
      <label
        ><span>模型选择</span
        ><DropdownSelect
          :model-value="model"
          :options="modelOptions"
          aria-label="选择图片生成模型"
          @update:model-value="emit('update:model', $event)"
      /></label>
      <label
        ><span>画面比例</span
        ><DropdownSelect
          :model-value="ratio"
          :options="ratioOptions"
          aria-label="选择画面比例"
          @update:model-value="emit('update:ratio', $event)"
      /></label>
      <label
        ><span>分辨率</span
        ><DropdownSelect
          :model-value="resolution"
          :options="resolutionOptions"
          aria-label="选择分辨率"
          @update:model-value="emit('update:resolution', $event)"
      /></label>
      <label v-if="modelIsGpt || modelIsGemini"
        ><span>质量</span
        ><DropdownSelect
          :model-value="quality"
          :options="qualityOptions"
          aria-label="选择图片质量"
          @update:model-value="emit('update:quality', $event)"
      /></label>
      <label>
        <span>批量抽卡（最多 {{ maxCount }} 张）</span>
        <div class="stepper">
          <button @click="emit('update:count', Math.max(1, count - 1))">
            −
          </button>
          <b>{{ count }}</b>
          <button @click="emit('update:count', Math.min(maxCount, count + 1))">
            ＋
          </button>
        </div>
      </label>
      <button class="generate" :disabled="busy" @click="emit('generate')">
        ✦ {{ busy ? '生成中…' : '生成' }}
      </button>
    </div>
  </section>
</template>
