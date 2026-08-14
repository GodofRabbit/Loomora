<script setup>
defineProps({ activeView: { type: String, required: true } });
defineEmits(['create', 'gallery', 'settings']);
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true"></span><b>Loomora</b>
    </div>
    <nav>
      <a :class="{ active: activeView === 'create' }" @click="$emit('create')"
        >AI 创作</a
      >
      <a :class="{ active: activeView === 'gallery' }" @click="$emit('gallery')"
        >作品库</a
      >
      <a>灵感广场</a>
    </nav>
    <button
      class="config-btn"
      title="打开接口设置"
      aria-label="打开接口设置"
      @click="$emit('settings')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2.12 2.12-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V20h-3v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06-2.12-2.12.06-.06A1.65 1.65 0 0 0 7.1 15a1.65 1.65 0 0 0-1.51-1H5.5v-3h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06 2.12-2.12.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V4.7h3v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06 2.12 2.12-.06.06a1.65 1.65 0 0 0-.33 1.82v.08A1.65 1.65 0 0 0 20.91 11H21v3h-.09A1.65 1.65 0 0 0 19.4 15Z"
        />
      </svg>
    </button>
  </header>
</template>
