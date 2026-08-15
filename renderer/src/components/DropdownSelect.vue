<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
  modelValue: { type: String, required: true },
  options: { type: Array, required: true },
  ariaLabel: { type: String, default: '选择选项' },
});
const emit = defineEmits(['update:modelValue']);
const root = ref(null);
const optionElements = ref([]);
const open = ref(false);
const activeIndex = ref(0);
const placement = ref('down');
const listboxId = `dropdown-${Math.random().toString(36).slice(2, 9)}`;
const normalizedOptions = computed(() =>
  props.options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option,
  ),
);
const selectedLabel = computed(
  () =>
    normalizedOptions.value.find((option) => option.value === props.modelValue)
      ?.label || props.modelValue,
);

function focusActiveOption() {
  nextTick(() => optionElements.value[activeIndex.value]?.focus());
}
function updatePanelPlacement() {
  if (!open.value || !root.value) return;
  const rect = root.value.getBoundingClientRect();
  const panel = root.value.querySelector('.dropdown-select-panel');
  const panelHeight = panel
    ? Math.min(panel.scrollHeight, 252)
    : Math.min(normalizedOptions.value.length * 40 + 10, 252);
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  placement.value =
    spaceBelow < panelHeight + 12 && spaceAbove > spaceBelow ? 'up' : 'down';
}
function openMenu() {
  activeIndex.value = Math.max(
    0,
    normalizedOptions.value.findIndex(
      (option) => option.value === props.modelValue,
    ),
  );
  open.value = true;
  nextTick(() => {
    updatePanelPlacement();
    focusActiveOption();
  });
}
function toggleMenu() {
  if (open.value) {
    open.value = false;
    return;
  }
  openMenu();
}
function selectOption(option) {
  emit('update:modelValue', option.value);
  open.value = false;
  root.value?.querySelector('.dropdown-select-trigger')?.focus();
}
function moveActive(step) {
  const total = normalizedOptions.value.length;
  if (!total) return;
  activeIndex.value = (activeIndex.value + step + total) % total;
  focusActiveOption();
}
function onTriggerKeydown(event) {
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    if (!open.value) openMenu();
    else moveActive(event.key === 'ArrowDown' ? 1 : -1);
  }
}
function onOptionKeydown(event, option) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveActive(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveActive(-1);
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    selectOption(option);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    open.value = false;
    root.value?.querySelector('.dropdown-select-trigger')?.focus();
  }
}
function closeFromOutside(event) {
  const path = event.composedPath?.() || [];
  if (
    root.value &&
    (root.value.contains(event.target) || path.includes(root.value))
  ) {
    return;
  }
  open.value = false;
}

onMounted(() => {
  document.addEventListener('pointerdown', closeFromOutside, true);
  document.addEventListener('focusin', closeFromOutside, true);
  document.addEventListener('scroll', updatePanelPlacement, true);
  window.addEventListener('resize', updatePanelPlacement);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeFromOutside, true);
  document.removeEventListener('focusin', closeFromOutside, true);
  document.removeEventListener('scroll', updatePanelPlacement, true);
  window.removeEventListener('resize', updatePanelPlacement);
});
</script>

<template>
  <div
    ref="root"
    class="dropdown-select"
    :class="{ open, 'drop-up': placement === 'up' }"
  >
    <button
      class="dropdown-select-trigger"
      type="button"
      role="combobox"
      :aria-label="ariaLabel"
      :aria-controls="listboxId"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      <span>{{ selectedLabel }}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m7 10 5 5 5-5" />
      </svg>
    </button>
    <Transition name="dropdown-panel">
      <div
        v-if="open"
        :id="listboxId"
        class="dropdown-select-panel"
        role="listbox"
        :aria-label="ariaLabel"
      >
        <button
          v-for="(option, index) in normalizedOptions"
          :key="option.value"
          :ref="(element) => (optionElements[index] = element)"
          type="button"
          role="option"
          :aria-selected="option.value === modelValue"
          :class="{ selected: option.value === modelValue }"
          @click="selectOption(option)"
          @focus="activeIndex = index"
          @keydown="onOptionKeydown($event, option)"
        >
          <span>{{ option.label }}</span>
          <svg
            v-if="option.value === modelValue"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="m5 12 4 4L19 6" />
          </svg>
        </button>
      </div>
    </Transition>
  </div>
</template>
