<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import AppHeader from './components/AppHeader.vue';
import CreationPanel from './components/CreationPanel.vue';
import ImageContextMenu from './components/ImageContextMenu.vue';
import ImageEditorModal from './components/ImageEditorModal.vue';
import ImageLightbox from './components/ImageLightbox.vue';
import OcrDrawer from './components/OcrDrawer.vue';
import SettingsModal from './components/SettingsModal.vue';
import ToastMessage from './components/ToastMessage.vue';
import WorksGallery from './components/WorksGallery.vue';
import { useGenerationForm } from './composables/useGenerationForm';
import { useImageEditor } from './composables/useImageEditor';
import { useOcr } from './composables/useOcr';
import { distributeGalleryItems, sortGalleryItems } from './utils/gallery';

const view = ref('create');
const status = ref('');
const settingsOpen = ref(false);
const toast = ref(null);
const gallery = ref([]);
const galleryLoading = ref(false);
const galleryImporting = ref(false);
const galleryColumnCount = ref(4);
const preview = ref(null);
const contextMenu = ref(null);
const scrollContainer = ref(null);
const scrollThumbTop = ref(0);
const scrollThumbHeight = ref(80);
const scrollbarVisible = ref(false);
const editorModal = ref(null);
let toastTimer;
let scrollResizeObserver;
let stopGenerationStatus;

function showToast(message, type = 'success') {
  clearTimeout(toastTimer);
  toast.value = { message, type };
  toastTimer = setTimeout(() => {
    toast.value = null;
  }, 4000);
}

const form = useGenerationForm({ status, showToast });
const {
  prompt,
  ratio,
  count,
  reference,
  images,
  imagePaths,
  busy,
  model,
  resolution,
  quality,
  settingsEndpoint,
  settingsApiKey,
  modelIsGpt,
  modelIsGemini,
  ratioOptions,
  resolutionOptions,
  qualityOptions,
  maxReferences,
  maxCount,
  promptLimit,
  counter,
  modelOptions,
} = form;

const ocr = useOcr(showToast);
const currentPreview = computed(
  () => preview.value?.items[preview.value.index],
);
const galleryColumns = computed(() =>
  distributeGalleryItems(gallery.value, galleryColumnCount.value),
);

function closePreview() {
  preview.value = null;
  ocr.close();
}

function editorHost() {
  const host = editorModal.value?.host;
  return host?.value || host;
}

const editor = useImageEditor({
  getHost: editorHost,
  closePreview,
  closeOcr: ocr.close,
  recognize: ocr.recognize,
  gallery,
  sortGalleryItems,
  status,
  showToast,
});

function updateScrollbar() {
  const element = scrollContainer.value;
  if (!element) return;
  scrollbarVisible.value =
    !galleryLoading.value && element.scrollHeight > element.clientHeight + 1;
  if (!scrollbarVisible.value) return;
  const trackHeight = element.clientHeight - 24;
  scrollThumbHeight.value = Math.max(
    48,
    trackHeight * (element.clientHeight / element.scrollHeight),
  );
  const maxTop = trackHeight - scrollThumbHeight.value;
  scrollThumbTop.value =
    element.scrollHeight > element.clientHeight
      ? 12 +
        maxTop *
          (element.scrollTop / (element.scrollHeight - element.clientHeight))
      : 12;
}

function startScrollDrag(event) {
  const element = scrollContainer.value;
  const startY = event.clientY;
  const startScroll = element.scrollTop;
  const available = element.clientHeight - 24 - scrollThumbHeight.value;
  const maxScroll = element.scrollHeight - element.clientHeight;
  const move = (moveEvent) => {
    element.scrollTop =
      startScroll + ((moveEvent.clientY - startY) / available) * maxScroll;
  };
  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
}

function updateGalleryColumnCount() {
  galleryColumnCount.value =
    window.innerWidth <= 850 ? 2 : window.innerWidth <= 1180 ? 3 : 4;
}

function galleryPreviewItems() {
  return gallery.value.map((item) => ({
    src: item.data,
    name: item.name,
    filePath: item.path,
    editable: true,
  }));
}

function generatedPreviewItems() {
  return images.value.map((source, index) => ({
    src: source,
    name: `Generated image ${index + 1}`,
    filePath: imagePaths.value[index],
  }));
}

function openPreview({ type, index = 0, item }) {
  if (type === 'gallery') {
    preview.value = {
      items: galleryPreviewItems(),
      index: gallery.value.indexOf(item),
    };
    return;
  }
  preview.value = { items: generatedPreviewItems(), index };
}

function openReferencePreview(index) {
  preview.value = {
    items: reference.value.map((item) => ({
      src: item.data,
      name: item.name,
    })),
    index,
  };
}

function movePreview(step) {
  if (!preview.value?.items.length) return;
  const total = preview.value.items.length;
  preview.value.index = (preview.value.index + step + total) % total;
  ocr.close();
}

function showImageMenu(event, source, filePath = '', editable = false) {
  event.preventDefault();
  contextMenu.value = {
    x: event.clientX,
    y: event.clientY,
    src: source,
    filePath,
    editable,
  };
}

async function copyContextImage() {
  if (!contextMenu.value) return;
  try {
    await window.forge.copyImage(contextMenu.value.src);
    status.value = '图片已复制';
  } catch (error) {
    status.value = error?.message || '复制图片失败';
  } finally {
    contextMenu.value = null;
  }
}

async function downloadContextImage() {
  if (!contextMenu.value) return;
  const { src, filePath } = contextMenu.value;
  const name = filePath ? filePath.split(/[\\/]/).pop() : '';
  contextMenu.value = null;
  try {
    const result = await window.forge.downloadImage({ src, filePath, name });
    if (result.saved) {
      status.value = `图片已保存到 ${result.path}`;
      showToast(`下载完成：${result.path}`);
    }
  } catch (error) {
    status.value = error?.message || '图片下载失败';
    showToast(status.value, 'error');
  }
}

function recognizeContextText() {
  if (!contextMenu.value) return;
  const { src, filePath } = contextMenu.value;
  contextMenu.value = null;
  ocr.recognize(src, filePath?.split(/[\\/]/).pop() || '图片');
}

function editContextImage() {
  if (!contextMenu.value?.editable) return;
  const item = {
    src: contextMenu.value.src,
    name: contextMenu.value.filePath.split(/[\\/]/).pop(),
    filePath: contextMenu.value.filePath,
    editable: true,
  };
  contextMenu.value = null;
  editor.openEditor(item);
}

async function showContextImageInFolder() {
  if (!contextMenu.value?.filePath) return;
  const filePath = contextMenu.value.filePath;
  contextMenu.value = null;
  try {
    await window.forge.showImageInFolder(filePath);
  } catch (error) {
    status.value = error?.message || '无法打开文件所在位置';
  }
}

async function deleteContextImage() {
  if (!contextMenu.value?.filePath) return;
  const filePath = contextMenu.value.filePath;
  contextMenu.value = null;
  try {
    const result = await window.forge.deleteImage(filePath);
    if (!result.deleted) return;
    const generatedIndex = imagePaths.value.indexOf(filePath);
    if (generatedIndex >= 0) {
      imagePaths.value.splice(generatedIndex, 1);
      images.value.splice(generatedIndex, 1);
    }
    gallery.value = gallery.value.filter((item) => item.path !== filePath);
    closePreview();
    status.value = '图片已删除';
  } catch (error) {
    status.value = error?.message || '删除图片失败';
  }
}

async function openGallery() {
  view.value = 'gallery';
  if (galleryLoading.value) return;
  galleryLoading.value = true;
  scrollbarVisible.value = false;
  if (scrollContainer.value) scrollContainer.value.scrollTop = 0;
  await nextTick();
  try {
    gallery.value = sortGalleryItems(await window.forge.listGallery());
  } catch (error) {
    gallery.value = [];
    status.value = error?.message || '作品库加载失败';
    showToast(status.value, 'error');
  } finally {
    galleryLoading.value = false;
    nextTick(updateScrollbar);
  }
}

async function importGalleryImages(files) {
  if (galleryImporting.value) return;
  galleryImporting.value = true;
  try {
    const result = await window.forge.importGalleryImages(files);
    if (result.canceled) return;
    if (result.items.length) {
      gallery.value = sortGalleryItems([...result.items, ...gallery.value]);
    }
    const importedCount = result.items.length;
    const failedCount = result.failed.length;
    if (!importedCount && failedCount) {
      status.value = `图片导入失败：${result.failed[0].error}`;
      showToast(status.value, 'error');
    } else {
      status.value = failedCount
        ? `成功导入 ${importedCount} 张图片，${failedCount} 张失败`
        : `成功导入 ${importedCount} 张图片`;
      showToast(status.value, failedCount ? 'error' : 'success');
    }
    nextTick(updateScrollbar);
  } catch (error) {
    status.value = error?.message || '图片导入失败';
    showToast(status.value, 'error');
  } finally {
    galleryImporting.value = false;
  }
}

function openSettings() {
  form.resetSettingsDraft();
  settingsOpen.value = true;
}

function saveSettings(endpoint, apiKey) {
  settingsEndpoint.value = endpoint;
  settingsApiKey.value = apiKey;
  form.saveSettings();
  settingsOpen.value = false;
}

function recognizePreview() {
  if (currentPreview.value) {
    ocr.recognize(currentPreview.value.src, currentPreview.value.name);
  }
}

function onPaste(event) {
  form.handlePaste(event, {
    view: view.value,
    editorOpen: editor.open.value,
    settingsOpen: settingsOpen.value,
  });
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    if (settingsOpen.value) settingsOpen.value = false;
    else if (ocr.open.value) ocr.close();
    else if (editor.open.value) editor.close();
    else {
      contextMenu.value = null;
      closePreview();
    }
    return;
  }
  if (preview.value && event.key === 'ArrowLeft') movePreview(-1);
  if (preview.value && event.key === 'ArrowRight') movePreview(1);
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('paste', onPaste);
  window.addEventListener('resize', updateScrollbar);
  window.addEventListener('resize', editor.updateOverlay);
  window.addEventListener('resize', updateGalleryColumnCount);
  updateGalleryColumnCount();
  scrollResizeObserver = new ResizeObserver(updateScrollbar);
  scrollResizeObserver.observe(scrollContainer.value);
  scrollResizeObserver.observe(scrollContainer.value.querySelector('main'));
  stopGenerationStatus = window.forge?.onGenerationStatus?.((message) => {
    status.value = message;
  });
  nextTick(updateScrollbar);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('paste', onPaste);
  window.removeEventListener('resize', updateScrollbar);
  window.removeEventListener('resize', editor.updateOverlay);
  window.removeEventListener('resize', updateGalleryColumnCount);
  scrollResizeObserver?.disconnect();
  stopGenerationStatus?.();
  editor.destroy();
  clearTimeout(toastTimer);
});
</script>

<template>
  <div
    ref="scrollContainer"
    class="app-shell"
    @scroll="updateScrollbar"
    @click="contextMenu = null"
  >
    <div class="window-titlebar" aria-hidden="true"></div>
    <AppHeader
      :active-view="view"
      @create="view = 'create'"
      @gallery="openGallery"
      @settings="openSettings"
    />
    <main>
      <CreationPanel
        v-if="view === 'create'"
        v-model:prompt="prompt"
        v-model:model="model"
        v-model:ratio="ratio"
        v-model:resolution="resolution"
        v-model:quality="quality"
        v-model:count="count"
        :reference="reference"
        :counter="counter"
        :prompt-limit="promptLimit"
        :model-options="modelOptions"
        :ratio-options="ratioOptions"
        :resolution-options="resolutionOptions"
        :quality-options="qualityOptions"
        :max-references="maxReferences"
        :max-count="maxCount"
        :model-is-gpt="modelIsGpt"
        :model-is-gemini="modelIsGemini"
        :busy="busy"
        @pick-reference="form.pickReference"
        @remove-reference="form.removeReference"
        @preview-reference="openReferencePreview"
        @generate="form.generate"
      >
        <template #status>{{ status || '准备就绪' }}</template>
      </CreationPanel>
      <WorksGallery
        :view="view"
        :images="images"
        :image-paths="imagePaths"
        :gallery="gallery"
        :gallery-columns="galleryColumns"
        :gallery-column-count="galleryColumnCount"
        :gallery-loading="galleryLoading"
        :gallery-importing="galleryImporting"
        @preview="openPreview"
        @context-menu="showImageMenu"
        @import="importGalleryImages()"
        @import-drop="importGalleryImages"
      />
    </main>
    <ImageLightbox
      v-if="preview && currentPreview"
      :preview="preview"
      :current-item="currentPreview"
      :ocr-busy="ocr.busy.value"
      @close="closePreview"
      @previous="movePreview(-1)"
      @next="movePreview(1)"
      @recognize="recognizePreview"
      @edit="editor.openEditor(currentPreview)"
      @context-menu="showImageMenu"
    />
    <ImageEditorModal
      ref="editorModal"
      :source="editor.source.value"
      :status="editor.message.value"
      :saving="editor.saving.value"
      :ocr-busy="ocr.busy.value"
      @recognize="editor.recognizeEditorText"
      @close="editor.close()"
      @save="editor.save"
    />
    <ImageContextMenu
      v-if="contextMenu"
      :menu="contextMenu"
      @copy="copyContextImage"
      @download="downloadContextImage"
      @recognize="recognizeContextText"
      @edit="editContextImage"
      @show-folder="showContextImageInFolder"
      @delete="deleteContextImage"
    />
    <OcrDrawer
      :open="ocr.open.value"
      :busy="ocr.busy.value"
      :lines="ocr.lines.value"
      :error="ocr.error.value"
      :source-name="ocr.sourceName.value"
      @close="ocr.close"
      @copy="ocr.copyText"
    />
    <SettingsModal
      :open="settingsOpen"
      :endpoint="settingsEndpoint"
      :api-key="settingsApiKey"
      @close="settingsOpen = false"
      @save="saveSettings"
    />
    <ToastMessage v-if="toast" :toast="toast" @close="toast = null" />
    <div v-show="scrollbarVisible" class="custom-scrollbar" aria-hidden="true">
      <div
        class="custom-scrollbar-thumb"
        :style="{
          height: scrollThumbHeight + 'px',
          top: scrollThumbTop + 'px',
        }"
        @pointerdown.prevent="startScrollDrag"
      ></div>
    </div>
  </div>
</template>
