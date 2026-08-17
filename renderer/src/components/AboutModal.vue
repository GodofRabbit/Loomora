<script setup>
import { BookOpen, CircleHelp, Copy, Info, Sparkles, X } from 'lucide-vue-next';

defineProps({
  open: Boolean,
  appInfo: { type: Object, default: () => ({}) },
});
defineEmits(['close', 'copy-email', 'show-guide']);
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
            <span class="about-summary-icon"><Info aria-hidden="true" /></span>
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
              <Sparkles aria-hidden="true" /><b>功能说明</b>
            </div>
            <div class="about-feature-list">
              <span>流式单图与批量抽卡</span><span>参考图与历史重绘</span>
              <span>本地作品库与时间轴</span><span>图片编辑与文字识别</span>
              <span>灵感广场与提示词复用</span><span>自定义本地存储位置</span>
            </div>
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
