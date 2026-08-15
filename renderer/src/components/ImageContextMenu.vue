<script setup>
defineProps({ menu: { type: Object, required: true } });
defineEmits([
  'copy',
  'download',
  'recognize',
  'edit',
  'rename',
  'show-folder',
  'delete',
]);
</script>

<template>
  <div
    class="image-context-menu"
    :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
    @click.stop
  >
    <button @click="$emit('copy')"><span>▣</span>复制</button>
    <button @click="$emit('download')"><span>↓</span>下载</button>
    <button @click="$emit('recognize')"><span>文</span>识别文字</button>
    <button v-if="menu.editable" @click="$emit('edit')">
      <span>✎</span>编辑
    </button>
    <button v-if="menu.filePath" @click="$emit('rename')">
      <span>Aa</span>重命名
    </button>
    <button v-if="menu.filePath" @click="$emit('show-folder')">
      <span>↗</span>打开文件所在位置
    </button>
    <button v-if="menu.filePath" class="danger" @click="$emit('delete')">
      <span>×</span>删除
    </button>
  </div>
</template>
