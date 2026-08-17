<script setup>
import {
  Copy,
  Download,
  FolderOpen,
  ImagePlus,
  Pencil,
  RefreshCw,
  ScanText,
  TextCursorInput,
  Trash2,
} from 'lucide-vue-next';

defineProps({ menu: { type: Object, required: true } });
defineEmits([
  'copy',
  'reference',
  'regenerate',
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
    <button @click="$emit('copy')"><Copy aria-hidden="true" />复制</button>
    <button @click="$emit('reference')">
      <ImagePlus aria-hidden="true" />作为参考图创作
    </button>
    <button v-if="menu.regeneratable" @click="$emit('regenerate')">
      <RefreshCw aria-hidden="true" />重新生成
    </button>
    <button @click="$emit('download')">
      <Download aria-hidden="true" />下载
    </button>
    <button @click="$emit('recognize')">
      <ScanText aria-hidden="true" />识别文字
    </button>
    <button v-if="menu.editable" @click="$emit('edit')">
      <Pencil aria-hidden="true" />编辑
    </button>
    <button v-if="menu.filePath" @click="$emit('rename')">
      <TextCursorInput aria-hidden="true" />重命名
    </button>
    <button v-if="menu.filePath" @click="$emit('show-folder')">
      <FolderOpen aria-hidden="true" />打开文件所在位置
    </button>
    <button v-if="menu.filePath" class="danger" @click="$emit('delete')">
      <Trash2 aria-hidden="true" />删除
    </button>
  </div>
</template>
