<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Check, ChevronDown } from 'lucide-vue-next';

const props = defineProps({
  modelValue: { type: String, required: true },
  options: { type: Array, required: true },
  ariaLabel: { type: String, default: '选择选项' },
  editable: Boolean,
  placeholder: { type: String, default: '请选择' },
  maxLength: { type: Number, default: undefined },
});
const emit = defineEmits(['update:modelValue']);
const root = ref(null);
const optionElements = ref([]);
const open = ref(false);
const activeIndex = ref(0);
const placement = ref('down');
const searchQuery = ref('');
const suppressNextEditableFocus = ref(false);
const listboxId = `dropdown-${Math.random().toString(36).slice(2, 9)}`;
const normalizedOptions = computed(() =>
  (Array.isArray(props.options) ? props.options : []).map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option,
  ),
);
const selectedLabel = computed(
  () =>
    normalizedOptions.value.find((option) => option.value === props.modelValue)
      ?.label || props.modelValue || props.placeholder,
);
const menuOptions = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase();
  if (!props.editable || !query) return normalizedOptions.value;
  return normalizedOptions.value.filter((option) =>
    String(option.label || option.value)
      .toLocaleLowerCase()
      .includes(query),
  );
});

function focusActiveOption() {
  nextTick(() => optionElements.value[activeIndex.value]?.focus());
}
function updatePanelPlacement() {
  if (!open.value || !root.value) return;
  const rect = root.value.getBoundingClientRect();
  const panel = root.value.querySelector('.dropdown-select-panel');
  const panelHeight = panel
    ? Math.min(panel.scrollHeight, 252)
    : Math.min(menuOptions.value.length * 40 + 10, 252);
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  placement.value =
    spaceBelow < panelHeight + 12 && spaceAbove > spaceBelow ? 'up' : 'down';
}
function focusTrigger({ suppressEditableOpen = false } = {}) {
  if (props.editable) {
    suppressNextEditableFocus.value = suppressEditableOpen;
    root.value?.querySelector('input')?.focus();
    return;
  }
  root.value?.querySelector('.dropdown-select-trigger')?.focus();
}
function openMenu({ resetFilter = true, focusOption = true } = {}) {
  if (resetFilter) searchQuery.value = '';
  activeIndex.value = Math.max(
    0,
    menuOptions.value.findIndex(
      (option) => option.value === props.modelValue,
    ),
  );
  open.value = true;
  nextTick(() => {
    updatePanelPlacement();
    if (focusOption) focusActiveOption();
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
  focusTrigger({ suppressEditableOpen: true });
}
function moveActive(step) {
  const total = menuOptions.value.length;
  if (!total) return;
  activeIndex.value = (activeIndex.value + step + total) % total;
  focusActiveOption();
}
function onEditableInput(event) {
  const value = event.target.value;
  searchQuery.value = value;
  activeIndex.value = 0;
  emit('update:modelValue', value);
  if (!open.value) openMenu({ resetFilter: false, focusOption: false });
  else nextTick(updatePanelPlacement);
}
function onEditableFocus() {
  if (suppressNextEditableFocus.value) {
    suppressNextEditableFocus.value = false;
    return;
  }
  if (!open.value) openMenu({ focusOption: false });
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
    focusTrigger({ suppressEditableOpen: true });
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
    <div
      v-if="editable"
      class="dropdown-select-trigger dropdown-select-input-trigger"
    >
      <input
        :value="modelValue"
        type="text"
        role="combobox"
        :maxlength="maxLength"
        :placeholder="placeholder"
        :aria-label="ariaLabel"
        :aria-controls="listboxId"
        :aria-expanded="open"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        @input="onEditableInput"
        @focus="onEditableFocus"
        @keydown="onTriggerKeydown"
      />
      <button
        type="button"
        tabindex="-1"
        :aria-label="`${open ? '收起' : '展开'}${ariaLabel}`"
        @click="toggleMenu"
      >
        <ChevronDown aria-hidden="true" />
      </button>
    </div>
    <button
      v-else
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
      <ChevronDown aria-hidden="true" />
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
          v-for="(option, index) in menuOptions"
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
          <Check v-if="option.value === modelValue" aria-hidden="true" />
        </button>
        <div v-if="!menuOptions.length" class="dropdown-select-empty">
          没有匹配的已有选项
        </div>
      </div>
    </Transition>
  </div>
</template>
