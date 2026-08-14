<script setup>
defineProps({ toast: { type: Object, required: true } });
defineEmits(['close']);
</script>

<template>
  <Transition name="toast">
    <div
      v-if="toast"
      class="app-toast"
      :class="'app-toast-' + toast.type"
      role="status"
    >
      <span>{{ toast.type === 'success' ? '✓' : '!' }}</span>
      <p>{{ toast.message }}</p>
      <button title="关闭提示" aria-label="关闭提示" @click="$emit('close')">
        ×
      </button>
    </div>
  </Transition>
</template>
