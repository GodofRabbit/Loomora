import { nextTick, ref } from 'vue';
import { editorLocale } from '../config/editorLocale';

const BLEND_MODE_LABELS = {
  add: '线性减淡',
  diff: '差值',
  subtract: '减去',
  multiply: '正片叠底',
  screen: '滤色',
  lighten: '变亮',
  darken: '变暗',
};

export function useImageEditor({
  getHost,
  closePreview,
  closeOcr,
  recognize,
  gallery,
  sortGalleryItems,
  status,
  showToast,
}) {
  const source = ref(null);
  const open = ref(false);
  const saving = ref(false);
  const message = ref('');
  const mosaicActive = ref(false);
  const mosaicSize = ref(28);
  const overlay = ref(null);
  let imageEditor;
  let ImageEditorClass;
  let colorPickerObserver;
  let mosaicPoints = [];
  let mosaicDrawing = false;

  function getCanvasRect() {
    const canvas = getHost()?.querySelector('.lower-canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return rect.width && rect.height ? rect : null;
  }

  function clearOverlay() {
    const canvas = overlay.value;
    if (!canvas) return;
    canvas.width = Math.max(
      1,
      Math.round(canvas.clientWidth * devicePixelRatio),
    );
    canvas.height = Math.max(
      1,
      Math.round(canvas.clientHeight * devicePixelRatio),
    );
    const context = canvas.getContext('2d');
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  }

  function updateOverlay() {
    const canvas = overlay.value;
    const host = getHost();
    const rect = getCanvasRect();
    if (!canvas || !host || !rect) return;
    const hostRect = host.getBoundingClientRect();
    canvas.style.left = `${rect.left - hostRect.left}px`;
    canvas.style.top = `${rect.top - hostRect.top}px`;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    clearOverlay();
  }

  function addPoint(event) {
    const rect = overlay.value?.getBoundingClientRect();
    if (!rect) return;
    mosaicPoints.push({
      x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
    });
    drawPreview();
  }

  function drawPreview() {
    const canvas = overlay.value;
    if (!canvas || !mosaicPoints.length) return;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    context.beginPath();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = mosaicSize.value;
    context.strokeStyle = 'rgba(166, 120, 255, 0.42)';
    context.moveTo(mosaicPoints[0].x, mosaicPoints[0].y);
    for (const point of mosaicPoints.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
    const last = mosaicPoints[mosaicPoints.length - 1];
    context.beginPath();
    context.arc(last.x, last.y, mosaicSize.value / 2, 0, Math.PI * 2);
    context.fillStyle = 'rgba(181, 143, 255, 0.25)';
    context.fill();
  }

  function startStroke(event) {
    if (!mosaicActive.value || saving.value) return;
    mosaicDrawing = true;
    mosaicPoints = [];
    overlay.value?.setPointerCapture?.(event.pointerId);
    addPoint(event);
  }

  function continueStroke(event) {
    if (mosaicDrawing) addPoint(event);
  }

  function interpolate(points) {
    const result = [];
    for (let index = 0; index < points.length; index++) {
      const current = points[index];
      const previous = points[index - 1];
      if (!previous) {
        result.push(current);
        continue;
      }
      const distance = Math.hypot(
        current.x - previous.x,
        current.y - previous.y,
      );
      const steps = Math.max(
        1,
        Math.ceil(distance / Math.max(4, mosaicSize.value / 3)),
      );
      for (let step = 1; step <= steps; step++) {
        const ratio = step / steps;
        result.push({
          x: previous.x + (current.x - previous.x) * ratio,
          y: previous.y + (current.y - previous.y) * ratio,
        });
      }
    }
    return result;
  }

  async function applyStroke() {
    const rect = getCanvasRect();
    if (!rect || !mosaicPoints.length || !imageEditor) return;
    const image = new Image();
    image.src = imageEditor.toDataURL({ format: 'png' });
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const original = context.getImageData(0, 0, canvas.width, canvas.height);
    const output = context.createImageData(original);
    output.data.set(original.data);
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const radius = Math.max(8, (mosaicSize.value * (scaleX + scaleY)) / 2);
    const block = Math.max(6, Math.round(radius / 2.2));

    // Sample one pixel per block, then paint that sample across the block.
    // This produces a predictable mosaic independent of the source resolution.
    for (const point of interpolate(mosaicPoints)) {
      const centerX = Math.round(point.x * scaleX);
      const centerY = Math.round(point.y * scaleY);
      const left = Math.max(0, Math.floor(centerX - radius));
      const right = Math.min(canvas.width - 1, Math.ceil(centerX + radius));
      const top = Math.max(0, Math.floor(centerY - radius));
      const bottom = Math.min(canvas.height - 1, Math.ceil(centerY + radius));
      for (let y = top; y <= bottom; y += block) {
        for (let x = left; x <= right; x += block) {
          const sampleX = Math.min(canvas.width - 1, x + Math.floor(block / 2));
          const sampleY = Math.min(
            canvas.height - 1,
            y + Math.floor(block / 2),
          );
          if (Math.hypot(sampleX - centerX, sampleY - centerY) > radius) {
            continue;
          }
          const sample = (sampleY * canvas.width + sampleX) * 4;
          for (let yy = y; yy < Math.min(y + block, canvas.height); yy++) {
            for (let xx = x; xx < Math.min(x + block, canvas.width); xx++) {
              const target = (yy * canvas.width + xx) * 4;
              output.data[target] = original.data[sample];
              output.data[target + 1] = original.data[sample + 1];
              output.data[target + 2] = original.data[sample + 2];
              output.data[target + 3] = original.data[sample + 3];
            }
          }
        }
      }
    }
    context.putImageData(output, 0, 0);
    await imageEditor.loadImageFromURL(
      canvas.toDataURL('image/png'),
      source.value.name,
    );
    addMosaicHistoryEntry();
    mosaicPoints = [];
    clearOverlay();
    updateOverlay();
  }

  async function finishStroke(event) {
    if (!mosaicDrawing) return;
    mosaicDrawing = false;
    overlay.value?.releasePointerCapture?.(event.pointerId);
    try {
      await applyStroke();
    } catch (error) {
      message.value = error?.message || '马赛克处理失败';
      mosaicPoints = [];
      clearOverlay();
    }
  }

  function createOverlay() {
    if (overlay.value || !getHost()) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'mosaic-overlay';
    canvas.addEventListener('pointerdown', startStroke);
    canvas.addEventListener('pointermove', continueStroke);
    canvas.addEventListener('pointerup', finishStroke);
    canvas.addEventListener('pointercancel', finishStroke);
    getHost().appendChild(canvas);
    overlay.value = canvas;
  }

  function setMosaicActive(active) {
    mosaicActive.value = active;
    overlay.value?.classList.toggle('active', active);
    message.value = active ? '马赛克画笔已开启，拖动图片进行涂抹' : '';
    nextTick(updateOverlay);
  }

  function createMosaicIcon() {
    const icon = document.createElement('span');
    icon.className = 'loomora-mosaic-icon';
    icon.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 9; index += 1) {
      icon.appendChild(document.createElement('i'));
    }
    return icon;
  }

  function addMosaicHistoryEntry() {
    const history = imageEditor?.ui?._historyMenu;
    if (!history) return;

    // TUI makes loadImage undoable but deliberately omits it from the visible history list.
    history.add({ name: 'Mosaic' });
    const item = history.items.at(-1);
    const iconHost = item?.querySelector('.history-item-icon');
    item?.classList.add('loomora-mosaic-history');
    iconHost?.replaceChildren(createMosaicIcon());
  }

  function mountMosaicTools() {
    const host = getHost();
    const ui = imageEditor?.ui;
    const menu = host?.querySelector('.tui-image-editor-menu');
    const submenu = host?.querySelector('.tui-image-editor-submenu');
    const helpMenu = host?.querySelector('.tui-image-editor-help-menu');
    if (!host || !ui || !menu || !submenu || !helpMenu) return;

    const button = document.createElement('li');
    button.className =
      'tie-btn-mosaic tui-image-editor-item loomora-mosaic-menu';
    button.tabIndex = 0;
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', '马赛克');
    button.setAttribute('tooltip-content', '马赛克');

    button.appendChild(createMosaicIcon());
    menu.appendChild(button);

    const panel = document.createElement('div');
    panel.className = 'tui-image-editor-menu-mosaic loomora-mosaic-submenu';
    const controls = document.createElement('div');
    controls.className = 'loomora-mosaic-controls';
    const label = document.createElement('label');
    label.textContent = '笔刷大小';
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '12';
    range.max = '72';
    range.step = '2';
    range.value = String(mosaicSize.value);
    range.setAttribute('aria-label', '马赛克笔刷大小');
    const value = document.createElement('b');
    value.textContent = `${mosaicSize.value}px`;
    range.addEventListener('input', () => {
      mosaicSize.value = Number(range.value);
      value.textContent = `${mosaicSize.value}px`;
    });
    controls.append(label, range, value);
    panel.appendChild(controls);
    submenu.appendChild(panel);

    // Register the custom tool with TUI so menu switching and canvas positioning stay native.
    ui._buttonElements.mosaic = button;
    ui.mosaic = {
      changeStartMode: () => setMosaicActive(true),
      changeStandbyMode: () => setMosaicActive(false),
    };
    const selectMosaic = () => ui.changeMenu('mosaic');
    button.addEventListener('click', selectMosaic);
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectMosaic();
    });

    // Help tools bypass TUI's submenu switcher, so close mosaic before their actions run.
    helpMenu.addEventListener(
      'click',
      (event) => {
        if (!event.target.closest('.tui-image-editor-item')) return;
        if (ui.submenu === 'mosaic') ui.changeMenu('mosaic');
      },
      true,
    );
  }

  function exposeDetailedColorPickers() {
    const host = getHost();
    if (!host) return;

    function decoratePickers() {
      host.querySelectorAll('.color-picker-control').forEach((control) => {
        control.classList.add('loomora-color-picker');
      });
      host
        .querySelectorAll('.tui-colorpicker-palette-toggle-slider')
        .forEach((button) => {
          // TUI rebuilds this input after color changes, restoring its English label.
          button.style.display = 'block';
          button.value = '更多颜色';
          button.setAttribute('aria-label', '打开详细取色器');
        });
      host.querySelectorAll('.tui-colorpicker-palette-hex').forEach((input) => {
        input.placeholder = '#RRGGBB';
        input.setAttribute('aria-label', 'HEX 颜色值');
      });
      host.querySelectorAll('.tui-colorpicker-huebar-handle').forEach((pin) => {
        // The stock 4x8 black marker is nearly invisible against the dark popup.
        pin.setAttribute('d', 'M-2 0 L7 5 L-2 10 Z');
      });
      host.querySelectorAll('#tie-filter-tint-opacity').forEach((slider) => {
        const control = slider.parentElement;
        const label = control?.querySelector(':scope > label');
        control?.classList.add('loomora-opacity-control');
        if (label && label.textContent !== '不透明度') {
          label.textContent = '不透明度';
        }
      });
      host
        .querySelectorAll('.tui-image-editor-selectlist-wrap option')
        .forEach((option) => {
          const label = BLEND_MODE_LABELS[option.value] || option.value;
          if (option.textContent !== label) option.textContent = label;
        });
      host
        .querySelectorAll('.tui-image-editor-selectlist li')
        .forEach((item) => {
          const value = item.dataset.item;
          const label = BLEND_MODE_LABELS[value] || value;
          if (item.textContent !== label) item.textContent = label;
        });
    }

    decoratePickers();
    colorPickerObserver?.disconnect();
    colorPickerObserver = new MutationObserver(decoratePickers);
    colorPickerObserver.observe(host, { childList: true, subtree: true });
  }

  async function openEditor(item) {
    if (!item?.editable || !item.filePath) return;
    source.value = { ...item };
    message.value = '正在加载编辑器...';
    closePreview();
    open.value = true;
    await nextTick();
    try {
      if (!ImageEditorClass) {
        const module = await import('tui-image-editor');
        ImageEditorClass = module.default || module;
      }
      const host = getHost();
      const availableCanvasHeight = Math.max(180, host.clientHeight - 56 - 150);
      imageEditor = new ImageEditorClass(getHost(), {
        includeUI: {
          loadImage: { path: source.value.src, name: source.value.name },
          locale: editorLocale,
          menu: [
            'crop',
            'flip',
            'rotate',
            'draw',
            'shape',
            'icon',
            'text',
            'filter',
          ],
          uiSize: { width: '100%', height: '100%' },
          menuBarPosition: 'bottom',
        },
        cssMaxWidth: Math.max(640, window.innerWidth - 100),
        cssMaxHeight: availableCanvasHeight,
        usageStatistics: false,
      });
      message.value = '';
      await nextTick();
      exposeDetailedColorPickers();
      createOverlay();
      mountMosaicTools();
      updateOverlay();
    } catch (error) {
      status.value = error?.message || '图片编辑器加载失败';
      close(true);
    }
  }

  function close(force = false) {
    if (saving.value && !force) return;
    imageEditor?.destroy();
    imageEditor = undefined;
    colorPickerObserver?.disconnect();
    colorPickerObserver = undefined;
    overlay.value?.remove();
    overlay.value = null;
    mosaicActive.value = false;
    mosaicPoints = [];
    mosaicDrawing = false;
    open.value = false;
    source.value = null;
    message.value = '';
    closeOcr();
  }

  async function save() {
    if (!imageEditor || !source.value?.filePath) return;
    saving.value = true;
    message.value = '正在保存新图片...';
    try {
      const result = await window.forge.saveEditedImage({
        sourcePath: source.value.filePath,
        dataUrl: imageEditor.toDataURL({ format: 'png' }),
      });
      if (!result.saved) {
        message.value = '';
        return;
      }
      if (result.item)
        gallery.value = sortGalleryItems([result.item, ...gallery.value]);
      status.value = `图片已保存到 ${result.path}`;
      showToast(`保存完成：${result.path}`);
      close(true);
    } catch (error) {
      message.value = error?.message || '保存编辑图片失败';
    } finally {
      saving.value = false;
    }
  }

  function recognizeEditorText() {
    if (!imageEditor || !source.value) return;
    recognize(imageEditor.toDataURL({ format: 'png' }), source.value.name);
  }

  function destroy() {
    imageEditor?.destroy();
    imageEditor = undefined;
  }

  return {
    source,
    open,
    saving,
    message,
    updateOverlay,
    openEditor,
    close,
    save,
    recognizeEditorText,
    destroy,
  };
}
