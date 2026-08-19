<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import {
  ImagePlus,
  MessageSquarePlus,
  Minus,
  Plus,
  Sparkles,
  WandSparkles,
  X,
  ChevronsDown,
} from 'lucide-vue-next';
import DropdownSelect from './DropdownSelect.vue';

const props = defineProps({
  prompt: { type: String, required: true },
  reference: { type: Array, required: true },
  model: { type: String, required: true },
  ratio: { type: String, required: true },
  resolution: { type: String, required: true },
  quality: { type: String, required: true },
  outputFormat: { type: String, required: true },
  counter: { type: String, required: true },
  promptLimit: { type: Number, required: true },
  modelOptions: { type: Array, required: true },
  ratioOptions: { type: Array, required: true },
  resolutionOptions: { type: Array, required: true },
  qualityOptions: { type: Array, required: true },
  outputFormatOptions: { type: Array, required: true },
  maxReferences: { type: Number, required: true },
  maxCount: { type: Number, required: true },
  count: { type: Number, required: true },
  providerCapabilities: { type: Object, default: () => ({}) },
  busy: Boolean,
  startMode: Boolean,
  collapseSignal: { type: Number, default: 0 },
  expandSignal: { type: Number, default: 0 },
  revealSignal: { type: Number, default: 0 },
  showBottomButton: Boolean,
});
const composerFocused = ref(false);
const composerHost = ref(null);
const promptInput = ref(null);
const compactComposer = computed(
  () => !props.startMode && !composerFocused.value,
);
const emit = defineEmits([
  'update:prompt',
  'update:model',
  'update:ratio',
  'update:resolution',
  'update:quality',
  'update:outputFormat',
  'update:count',
  'pick-reference',
  'remove-reference',
  'preview-reference',
  'generate',
  'cancel',
  'scroll-bottom',
  'composer-focus-change',
]);

function setComposerFocused(value) {
  const focused = Boolean(value);
  if (composerFocused.value === focused) return;
  composerFocused.value = focused;
  emit('composer-focus-change', focused);
}

function onComposerFocusOut(event) {
  if (
    event.relatedTarget instanceof Node &&
    event.currentTarget.contains(event.relatedTarget)
  ) {
    return;
  }
  if (
    !event.relatedTarget &&
    event.target?.closest?.('.prompt-tools, .reference-list')
  ) {
    return;
  }
  setComposerFocused(false);
}

function onComposerFocusIn(event) {
  if (event.target?.closest?.('.conversation-bottom-button')) return;
  setComposerFocused(true);
}

function collapseComposer() {
  setComposerFocused(false);
  const activeElement = document.activeElement;
  if (activeElement && composerHost.value?.contains(activeElement)) {
    activeElement.blur();
  }
}

watch(
  () => props.collapseSignal,
  () => {
    collapseComposer();
  },
);

watch(
  () => props.expandSignal,
  async () => {
    setComposerFocused(true);
    await nextTick();
    promptInput.value?.focus({ preventScroll: true });
  },
);

watch(
  () => props.revealSignal,
  () => {
    setComposerFocused(true);
  },
);
</script>

<template>
  <slot name="before-card"></slot>
  <section
    ref="composerHost"
    class="create-card"
    data-onboarding="composer"
    :class="{
      compact: compactComposer,
      'start-mode': startMode,
      'has-bottom-button': showBottomButton,
    }"
    @focusin="onComposerFocusIn"
    @focusout="onComposerFocusOut"
  >
    <div class="card-title">
      <div>
        <Sparkles class="card-title-icon" aria-hidden="true" />
        <h2>快速创作</h2>
      </div>
    </div>
    <div class="prompt-box">
      <MessageSquarePlus
        v-if="compactComposer"
        class="compact-prompt-icon"
        aria-hidden="true"
      />
      <textarea
        ref="promptInput"
        :value="prompt"
        :maxlength="promptLimit"
        :placeholder="
          compactComposer
            ? '描述你的创意画面...'
            : '描述你的创意画面，例如：金色晨曦洒在云海之上，未来城市与自然共生'
        "
        @input="emit('update:prompt', $event.target.value)"
      ></textarea>
      <div class="prompt-tools">
        <button
          v-if="providerCapabilities.references !== false"
          type="button"
          :disabled="maxReferences === 0"
          @mousedown.prevent
          @click="emit('pick-reference')"
        >
          <ImagePlus class="reference-upload-icon" aria-hidden="true" />
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
          @mousedown.prevent
          @click="emit('preview-reference', index)"
        />
        <span>{{ item.name }}</span>
        <button
          type="button"
          title="移除参考图"
          aria-label="移除参考图"
          @mousedown.prevent
          @click="emit('remove-reference', index)"
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
    <div class="control-row">
      <label class="model-control"
        ><span>模型选择</span
        ><DropdownSelect
          :model-value="model"
          :options="modelOptions"
          aria-label="选择图片生成模型"
          @update:model-value="emit('update:model', $event)"
      /></label>
      <label v-if="providerCapabilities.aspect !== false" class="ratio-control"
        ><span>画面比例</span
        ><DropdownSelect
          :model-value="ratio"
          :options="ratioOptions"
          aria-label="选择画面比例"
          @update:model-value="emit('update:ratio', $event)"
      /></label>
      <label
        v-if="providerCapabilities.size !== false"
        class="resolution-control"
        ><span>分辨率</span
        ><DropdownSelect
          :model-value="resolution"
          :options="resolutionOptions"
          aria-label="选择分辨率"
          @update:model-value="emit('update:resolution', $event)"
      /></label>
      <label
        v-if="providerCapabilities.quality !== false"
        class="quality-control"
        ><span>质量</span
        ><DropdownSelect
          :model-value="quality"
          :options="qualityOptions"
          aria-label="选择图片质量"
          @update:model-value="emit('update:quality', $event)"
      /></label>
      <label
        v-if="providerCapabilities.outputFormat !== false"
        class="output-format-control"
      >
        <span>输出格式</span>
        <DropdownSelect
          :model-value="outputFormat"
          :options="outputFormatOptions"
          aria-label="选择图片输出格式"
          @update:model-value="emit('update:outputFormat', $event)"
        />
      </label>
      <label class="count-control">
        <span>批量抽卡（最多 {{ maxCount }} 张）</span>
        <div class="stepper">
          <button
            type="button"
            @click="emit('update:count', Math.max(1, count - 1))"
          >
            <Minus aria-hidden="true" />
          </button>
          <b>{{ count }}</b>
          <button
            type="button"
            @click="emit('update:count', Math.min(maxCount, count + 1))"
          >
            <Plus aria-hidden="true" />
          </button>
        </div>
      </label>
      <div class="generation-actions action-control">
        <button type="button" class="generate" @click="emit('generate')">
          <WandSparkles aria-hidden="true" />
          {{
            busy
              ? '加入队列'
              : count > 1
                ? '批量生成'
                : providerCapabilities.streaming === false
                  ? '开始生成'
                  : '流式生成'
          }}
        </button>
        <button
          v-if="busy"
          type="button"
          class="cancel"
          title="取消生成"
          aria-label="取消生成"
          @click="emit('cancel')"
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
    <button
      v-if="showBottomButton"
      type="button"
      class="conversation-bottom-button"
      title="回到最新对话"
      aria-label="回到最新对话"
      @click="emit('scroll-bottom')"
    >
      <ChevronsDown aria-hidden="true" />
      <span>回到底部</span>
    </button>
  </section>
</template>
