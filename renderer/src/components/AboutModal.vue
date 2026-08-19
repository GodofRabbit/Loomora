<script setup>
import {
  BookOpen,
  CircleHelp,
  Copy,
  Download,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-vue-next';
import appLogo from '../../assets/logo-ui.png';

const props = defineProps({
  open: Boolean,
  appInfo: { type: Object, default: () => ({}) },
  updateState: {
    type: Object,
    default: () => ({ status: 'idle', message: '尚未检查更新', progress: 0 }),
  },
});
defineEmits([
  'close',
  'copy-email',
  'show-guide',
  'check-update',
  'download-update',
  'install-update',
]);
</script>

<template>
  <Transition name="settings-modal">
    <div v-if="open" class="settings-modal-layer">
      <section
        class="settings-modal about-modal"
        role="dialog"
        aria-modal="true"
        aria-label="关于 Loomora"
        @click.stop
      >
        <header>
          <div><b>关于与帮助</b><span>Loomora 使用信息</span></div>
          <button
            title="关闭关于与帮助"
            aria-label="关闭关于与帮助"
            @click="$emit('close')"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div class="about-modal-body">
          <section class="about-summary">
            <img class="about-summary-logo" :src="appLogo" alt="Loomora Logo" />
            <div>
              <h2>
                Loomora <small>v{{ appInfo.version || '1.0.0' }}</small>
              </h2>
              <p>把灵感变成画面，并在本地整理每一次创作。</p>
              <dl>
                <div>
                  <dt>作者</dt>
                  <dd>{{ appInfo.author || '伟大的兔神' }}</dd>
                </div>
                <div>
                  <dt>邮箱</dt>
                  <dd>
                    {{ appInfo.email || 'believe_rl@163.com' }}
                    <button
                      title="复制邮箱"
                      aria-label="复制邮箱"
                      @click="$emit('copy-email')"
                    >
                      <Copy aria-hidden="true" />
                    </button>
                  </dd>
                </div>
              </dl>
            </div>
          </section>
          <section class="about-section">
            <div class="about-section-title">
              <BookOpen aria-hidden="true" /><b>使用说明</b>
            </div>
            <ol>
              <li>先在设置中填写兼容接口地址和 API Key。</li>
              <li>
                在快速创作中输入提示词，可按需添加参考图并选择尺寸、质量和张数。
              </li>
              <li>
                生成结果和当天对话会自动保存，可在作品库中筛选、编辑、导出或继续创作。
              </li>
            </ol>
          </section>
          <section class="about-section">
            <div class="about-section-title">
              <Sparkles aria-hidden="true" /><b>功能介绍</b>
            </div>
            <div class="about-feature-list">
              <span>AI 单图与批量生成</span><span>参考图与多轮创作</span>
              <span>本地作品库、导入与时间轴</span>
              <span>图片编辑与离线文字识别</span>
              <span>灵感广场与提示词复用</span><span>自定义存储目录与导出</span>
            </div>
          </section>
          <section class="about-section about-update-section">
            <div class="about-section-title">
              <RefreshCw aria-hidden="true" /><b>应用更新</b>
            </div>
            <div class="about-update-row">
              <span class="about-update-message">{{
                props.updateState.message
              }}</span>
              <button
                v-if="
                  !['checking', 'downloading'].includes(
                    props.updateState.status,
                  )
                "
                class="about-update-action"
                type="button"
                @click="$emit('check-update')"
              >
                <RefreshCw aria-hidden="true" />检查更新
              </button>
              <button v-else class="about-update-action" type="button" disabled>
                <RefreshCw class="spin" aria-hidden="true" />处理中
              </button>
            </div>
            <div
              v-if="props.updateState.status === 'downloading'"
              class="about-update-progress"
            >
              <span :style="{ width: `${props.updateState.progress || 0}%` }" />
            </div>
            <button
              v-if="props.updateState.status === 'available'"
              class="about-update-primary"
              type="button"
              @click="$emit('download-update')"
            >
              <Download aria-hidden="true" />下载新版本
            </button>
            <button
              v-if="props.updateState.status === 'downloaded'"
              class="about-update-primary"
              type="button"
              @click="$emit('install-update')"
            >
              <Download aria-hidden="true" />重启并安装
            </button>
          </section>
        </div>
        <footer>
          <button
            class="settings-cancel about-guide-button"
            @click="$emit('show-guide')"
          >
            <CircleHelp aria-hidden="true" />查看新手引导
          </button>
          <button class="settings-save" @click="$emit('close')">知道了</button>
        </footer>
      </section>
    </div>
  </Transition>
</template>
