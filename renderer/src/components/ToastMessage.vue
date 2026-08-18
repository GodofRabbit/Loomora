<script setup>
import { CircleAlert, CircleCheck, X } from 'lucide-vue-next';

defineProps({
  toast: { type: Object, required: true },
  elevated: Boolean,
});
defineEmits(['close']);
</script>

<template>
  <Transition name="toast">
    <div
      v-if="toast"
      class="app-toast"
      :class="['app-toast-' + toast.type, { 'app-toast-elevated': elevated }]"
      role="status"
    >
      <span>
        <CircleCheck v-if="toast.type === 'success'" aria-hidden="true" />
        <CircleAlert v-else aria-hidden="true" />
      </span>
      <p>{{ toast.message }}</p>
      <button
        title="关闭提示"
        aria-label="关闭提示"
        @mousedown.prevent.stop
        @click.stop="$emit('close')"
      >
        <X aria-hidden="true" />
      </button>
    </div>
  </Transition>
</template>
