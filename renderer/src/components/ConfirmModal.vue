<script setup>
import { Trash2, X } from 'lucide-vue-next';
import appLogo from '../../assets/logo-ui.png';

defineProps({
  open: Boolean,
  title: { type: String, default: '确认操作' },
  message: { type: String, required: true },
  detail: { type: String, default: '' },
  eyebrow: { type: String, default: '本地作品管理' },
  confirmLabel: { type: String, default: '确认' },
  busyLabel: { type: String, default: '正在删除...' },
  busy: Boolean,
});

defineEmits(['close', 'confirm']);
</script>

<template>
  <Transition name="settings-modal">
    <div v-if="open" class="settings-modal-layer confirm-modal-layer">
      <section
        class="settings-modal confirm-modal"
        role="alertdialog"
        aria-modal="true"
        :aria-label="title"
        @click.stop
      >
        <button
          type="button"
          class="confirm-modal-close"
          :disabled="busy"
          title="关闭确认弹窗"
          aria-label="关闭确认弹窗"
          @click="$emit('close')"
        >
          <X aria-hidden="true" />
        </button>
        <div class="confirm-modal-body">
          <img
            class="confirm-modal-logo"
            :src="appLogo"
            alt=""
            aria-hidden="true"
          />
          <div class="confirm-modal-copy">
            <small>{{ eyebrow }}</small>
            <h2>{{ title }}</h2>
            <b>{{ message }}</b>
            <p v-if="detail">{{ detail }}</p>
          </div>
        </div>
        <footer>
          <button
            type="button"
            class="settings-cancel"
            :disabled="busy"
            @click="$emit('close')"
          >
            取消
          </button>
          <button
            type="button"
            class="confirm-modal-submit"
            :disabled="busy"
            @click="$emit('confirm')"
          >
            <Trash2 aria-hidden="true" />
            <span>{{ busy ? busyLabel : confirmLabel }}</span>
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>
