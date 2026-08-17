<script setup>
import { CircleHelp, Settings } from 'lucide-vue-next';

defineProps({ activeView: { type: String, required: true } });
defineEmits(['home', 'create', 'gallery', 'inspiration', 'settings', 'about']);
</script>

<template>
  <header class="topbar">
    <button
      type="button"
      class="brand"
      data-onboarding="home"
      title="返回新创作"
      aria-label="返回新创作"
      @click="$emit('home')"
    >
      <span class="brand-mark" aria-hidden="true"></span><b>Loomora</b>
    </button>
    <nav>
      <a :class="{ active: activeView === 'create' }" @click="$emit('create')"
        >AI 创作</a
      >
      <a
        data-onboarding="gallery"
        :class="{ active: activeView === 'gallery' }"
        @click="$emit('gallery')"
        >作品库</a
      >
      <a
        data-onboarding="inspiration"
        :class="{ active: activeView === 'inspiration' }"
        @click="$emit('inspiration')"
        >灵感广场</a
      >
    </nav>
    <div class="header-actions">
      <button
        type="button"
        class="config-btn"
        title="关于与帮助"
        aria-label="关于与帮助"
        @click="$emit('about')"
      >
        <CircleHelp aria-hidden="true" />
      </button>
      <button
        type="button"
        class="config-btn"
        title="打开设置"
        aria-label="打开设置"
        data-onboarding="settings"
        @click="$emit('settings')"
      >
        <Settings aria-hidden="true" />
      </button>
    </div>
  </header>
</template>
