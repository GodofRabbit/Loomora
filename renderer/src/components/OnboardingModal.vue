<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { ArrowLeft, ArrowRight, Check } from 'lucide-vue-next';

const props = defineProps({ open: Boolean });
const emit = defineEmits(['close', 'finish']);
const step = ref(0);
const guideCard = ref(null);
const targetRect = ref(null);
const viewport = ref({ width: 0, height: 0 });
const guidePosition = ref({ left: 16, top: 16, placement: 'below' });
const steps = [
  {
    selector: '[data-onboarding="settings"]',
    placement: 'left',
    padding: 7,
    eyebrow: '第一步',
    title: '先连接图像服务',
    description: '点这里填写接口地址和 API Key，配置只保存在当前设备。',
  },
  {
    selector: '[data-onboarding="composer"]',
    placement: 'above',
    padding: 8,
    eyebrow: '第二步',
    title: '把画面告诉 Loomora',
    description: '写下提示词，选好模型和画面规格，也可以加入参考图。',
  },
  {
    selector: '[data-onboarding="conversation"]',
    fallbackSelector: '[data-onboarding-fallback="conversation"]',
    placement: 'right',
    padding: 8,
    eyebrow: '第三步',
    title: '创作过程都会留在这里',
    description: '随时查看历史创作，继续修改提示词或沿用成图作为参考。',
  },
  {
    selector: '[data-onboarding="gallery"]',
    placement: 'left',
    padding: 7,
    eyebrow: '第四步',
    title: '成图都收进作品库',
    description: '在这里查看、导入、导出和整理保存在本地的图片。',
  },
  {
    selector: '[data-onboarding="inspiration"]',
    placement: 'right',
    padding: 7,
    eyebrow: '第五步',
    title: '从灵感广场发现新方向',
    description: '浏览精选案例和提示词，用喜欢的灵感快速开始下一次创作。',
  },
  {
    selector: '[data-onboarding="home"]',
    placement: 'right',
    padding: 7,
    eyebrow: '最后一步',
    title: '随时回到创作首屏',
    description: '点击左上角 Logo 或文字，即可回到创作首屏。',
  },
];

const current = computed(() => steps[step.value]);
const isLast = computed(() => step.value === steps.length - 1);
const highlightStyle = computed(() => {
  if (!targetRect.value) return { display: 'none' };
  return {
    top: `${targetRect.value.top}px`,
    left: `${targetRect.value.left}px`,
    width: `${targetRect.value.width}px`,
    height: `${targetRect.value.height}px`,
  };
});
const guideStyle = computed(() => ({
  top: `${guidePosition.value.top}px`,
  left: `${guidePosition.value.left}px`,
}));
const connectorPath = computed(() => {
  const rect = targetRect.value;
  if (!rect) return '';

  const cardWidth = guideCard.value?.offsetWidth || 390;
  const cardHeight = guideCard.value?.offsetHeight || 180;
  const guide = guidePosition.value;
  let start;
  let end;

  if (guide.placement === 'left') {
    start = { x: guide.left + cardWidth - 18, y: guide.top + 30 };
    end = { x: rect.left - 5, y: rect.top + rect.height / 2 };
  } else if (guide.placement === 'right') {
    start = { x: guide.left + 18, y: guide.top + 30 };
    end = { x: rect.right + 5, y: rect.top + rect.height / 2 };
  } else if (guide.placement === 'above') {
    start = { x: guide.left + cardWidth / 2, y: guide.top + cardHeight - 8 };
    end = { x: rect.left + rect.width / 2, y: rect.top - 5 };
  } else {
    start = { x: guide.left + cardWidth / 2, y: guide.top + 8 };
    end = { x: rect.left + rect.width / 2, y: rect.bottom + 5 };
  }

  if (guide.placement === 'left' || guide.placement === 'right') {
    const bend = (start.x + end.x) / 2;
    return `M ${start.x} ${start.y} C ${bend} ${start.y}, ${bend} ${end.y}, ${end.x} ${end.y}`;
  }

  const bend = (start.y + end.y) / 2;
  return `M ${start.x} ${start.y} C ${start.x} ${bend}, ${end.x} ${bend}, ${end.x} ${end.y}`;
});
let positionFrame;
let targetObserver;
let observedTarget;
let listenersActive = false;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function paddedTargetRect(element, padding) {
  const rect = element.getBoundingClientRect();
  const left = clamp(rect.left - padding, 8, window.innerWidth - 8);
  const top = clamp(rect.top - padding, 8, window.innerHeight - 8);
  const right = clamp(rect.right + padding, 8, window.innerWidth - 8);
  const bottom = clamp(rect.bottom + padding, 8, window.innerHeight - 8);
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function resolveGuidePosition(rect) {
  const cardWidth = guideCard.value?.offsetWidth || 390;
  const cardHeight = guideCard.value?.offsetHeight || 180;
  const gap = 64;
  const edge = 28;
  const maxLeft = window.innerWidth - cardWidth - edge;
  const maxTop = window.innerHeight - cardHeight - edge;
  const centeredLeft = rect.left + (rect.width - cardWidth) / 2;
  let placement = current.value.placement;
  let left;
  let top;

  if (placement === 'left') {
    left = rect.left - cardWidth - 92;
    top = rect.bottom + 46;
  } else if (placement === 'right') {
    left = rect.right + 92;
    top = rect.top + (rect.height - cardHeight) / 2;
  } else if (placement === 'below') {
    left = centeredLeft;
    top = rect.bottom + gap;
  } else {
    left = centeredLeft;
    top = rect.top - cardHeight - gap;
  }

  if (placement === 'below' && top > maxTop) {
    placement = 'above';
    top = rect.top - cardHeight - gap;
  } else if (placement === 'above' && top < edge) {
    placement = 'below';
    top = rect.bottom + gap;
  } else if (placement === 'left' && left < edge) {
    placement = 'right';
    left = rect.right + 92;
    top = rect.top + (rect.height - cardHeight) / 2;
  } else if (placement === 'right' && left > maxLeft) {
    placement = 'left';
    left = rect.left - cardWidth - 92;
    top = rect.top + (rect.height - cardHeight) / 2;
  }

  return {
    left: clamp(left, edge, maxLeft),
    top: clamp(top, edge, maxTop),
    placement,
  };
}

function observeTarget(element) {
  if (observedTarget === element) return;
  targetObserver?.disconnect();
  observedTarget = element;
  targetObserver = new ResizeObserver(schedulePositionUpdate);
  targetObserver.observe(element);
}

function updatePosition() {
  positionFrame = undefined;
  if (!props.open) return;
  const element =
    document.querySelector(current.value.selector) ||
    (current.value.fallbackSelector
      ? document.querySelector(current.value.fallbackSelector)
      : null);
  if (!element) {
    targetRect.value = null;
    return;
  }
  observeTarget(element);
  viewport.value = {
    width: window.innerWidth,
    height: window.innerHeight,
  };
  const rect = paddedTargetRect(element, current.value.padding);
  targetRect.value = rect;
  guidePosition.value = resolveGuidePosition(rect);
}

function schedulePositionUpdate() {
  window.cancelAnimationFrame(positionFrame);
  positionFrame = window.requestAnimationFrame(updatePosition);
}

function startPositionTracking() {
  if (listenersActive) return;
  listenersActive = true;
  window.addEventListener('resize', schedulePositionUpdate);
  document.addEventListener('scroll', schedulePositionUpdate, true);
}

function stopPositionTracking() {
  if (!listenersActive) return;
  listenersActive = false;
  window.removeEventListener('resize', schedulePositionUpdate);
  document.removeEventListener('scroll', schedulePositionUpdate, true);
  targetObserver?.disconnect();
  observedTarget = undefined;
  window.cancelAnimationFrame(positionFrame);
}

function refreshCurrentStep() {
  targetRect.value = null;
  targetObserver?.disconnect();
  observedTarget = undefined;
  nextTick(() => {
    schedulePositionUpdate();
    window.requestAnimationFrame(schedulePositionUpdate);
  });
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      stopPositionTracking();
      return;
    }
    step.value = 0;
    startPositionTracking();
    refreshCurrentStep();
  },
  { immediate: true },
);

watch(step, refreshCurrentStep);

onBeforeUnmount(stopPositionTracking);
</script>

<template>
  <Teleport to="body">
    <Transition name="onboarding-tour">
      <div
        v-if="open"
        class="onboarding-layer"
        role="region"
        aria-label="首次使用引导"
      >
        <svg
          class="onboarding-connector"
          :viewBox="`0 0 ${viewport.width} ${viewport.height}`"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="onboarding-arrowhead"
              markerWidth="9"
              markerHeight="9"
              refX="7"
              refY="4.5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 8 4.5 L 0 9 Z" />
            </marker>
          </defs>
          <path
            v-if="connectorPath"
            :d="connectorPath"
            marker-end="url(#onboarding-arrowhead)"
          />
        </svg>
        <div
          class="onboarding-highlight"
          :style="highlightStyle"
          aria-hidden="true"
        ></div>
        <Transition name="onboarding-step" mode="out-in">
          <aside
            v-if="targetRect"
            :key="step"
            ref="guideCard"
            class="onboarding-guide"
            :style="guideStyle"
          >
            <header>
              <small
                >{{ current.eyebrow }} · {{ step + 1 }} /
                {{ steps.length }}</small
              >
            </header>

            <h2>{{ current.title }}</h2>
            <p>{{ current.description }}</p>

            <footer>
              <button
                type="button"
                class="onboarding-skip"
                @click="emit('close')"
              >
                跳过引导
              </button>
              <div class="onboarding-actions">
                <button
                  v-if="step > 0"
                  type="button"
                  class="onboarding-back"
                  title="上一步"
                  aria-label="上一步"
                  @click="step -= 1"
                >
                  <ArrowLeft aria-hidden="true" />
                </button>
                <button
                  v-if="!isLast"
                  type="button"
                  class="onboarding-primary"
                  @click="step += 1"
                >
                  知道了，下一步<ArrowRight aria-hidden="true" />
                </button>
                <button
                  v-else
                  type="button"
                  class="onboarding-primary"
                  @click="emit('finish')"
                >
                  <Check aria-hidden="true" />开始创作
                </button>
              </div>
            </footer>
          </aside>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
