<script setup>
import { computed, ref, watch } from 'vue';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FolderCog,
  Images,
  KeyRound,
  WandSparkles,
  X,
} from 'lucide-vue-next';

const props = defineProps({ open: Boolean });
const emit = defineEmits(['close', 'finish']);
const step = ref(0);
const steps = [
  {
    icon: KeyRound,
    eyebrow: '第一步',
    title: '连接你的图像服务',
    description:
      '打开右上角设置，填写兼容接口地址和 API Key。密钥只保存在当前设备。',
  },
  {
    icon: WandSparkles,
    eyebrow: '第二步',
    title: '描述你想看到的画面',
    description:
      '输入提示词，选择模型、画面比例和清晰度；也可以添加参考图，让结果更贴近设想。',
  },
  {
    icon: Images,
    eyebrow: '第三步',
    title: '继续创作，而不是从头开始',
    description:
      '每一轮请求和结果都会形成对话。你可以编辑提示词、重新生成，或把成图直接作为参考图。',
  },
  {
    icon: FolderCog,
    eyebrow: '最后一步',
    title: '作品始终由你保管',
    description:
      '作品和历史默认保存在本地 Gallery 目录，也可以在设置中切换到你指定的位置。',
  },
];
const current = computed(() => steps[step.value]);
const isLast = computed(() => step.value === steps.length - 1);

watch(
  () => props.open,
  (open) => {
    if (open) step.value = 0;
  },
);
</script>

<template>
  <Transition name="settings-modal">
    <div v-if="open" class="settings-modal-layer onboarding-layer">
      <section
        class="onboarding-modal"
        role="dialog"
        aria-modal="true"
        aria-label="首次使用引导"
      >
        <button
          class="onboarding-close"
          title="跳过引导"
          aria-label="跳过引导"
          @click="emit('close')"
        >
          <X aria-hidden="true" />
        </button>
        <div class="onboarding-progress" aria-label="引导进度">
          <span
            v-for="(_, index) in steps"
            :key="index"
            :class="{ active: index <= step }"
          ></span>
        </div>
        <Transition name="onboarding-step" mode="out-in">
          <div :key="step" class="onboarding-step">
            <span class="onboarding-step-icon"
              ><component :is="current.icon" aria-hidden="true"
            /></span>
            <small>{{ current.eyebrow }}</small>
            <h2>{{ current.title }}</h2>
            <p>{{ current.description }}</p>
          </div>
        </Transition>
        <footer>
          <button
            class="onboarding-secondary"
            :disabled="step === 0"
            @click="step -= 1"
          >
            <ArrowLeft aria-hidden="true" />上一步
          </button>
          <button v-if="!isLast" class="onboarding-primary" @click="step += 1">
            下一步<ArrowRight aria-hidden="true" />
          </button>
          <button v-else class="onboarding-primary" @click="emit('finish')">
            <Check aria-hidden="true" />开始创作
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>
