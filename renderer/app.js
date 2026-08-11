const { reactive } = Vue;
const uiState = reactive({ prompt: '', count: 1, ratio: '1:1', status: '' });
const app = document.getElementById('app');
app.innerHTML = `<aside class="sidebar"><div class="brand"><span class="logo">✦</span><div><b>Image Forge</b><small>AI 创作工作台</small></div></div><nav><a class="active">▣　创作</a><a>◫　作品库</a><a>⚙　设置</a></nav><div class="side-bottom"><div class="quota"><span>本月额度</span><b>∞</b><small>API 额度由服务商管理</small></div><div class="version">v1.0.0 · Desktop</div></div></aside><main><header><div><h1>创建图像</h1><p>描述你的想法，交给 AI 变成画面</p></div><div class="header-actions"><button class="ghost" id="clear">清空</button><button class="key" id="saveKey">保存配置</button></div></header><section class="workspace"><div class="panel controls"><div class="field"><label>提示词 <span id="counter">0 / 2000</span></label><textarea id="prompt" placeholder="例如：一只戴着宇航头盔的橘猫，在月球表面看向地球，电影感光影，超精细"></textarea></div><div class="field"><label>参考图 <em>可选</em></label><div class="upload" id="upload"><div class="upload-icon">＋</div><div><b>添加参考图</b><small>支持 JPG、PNG、WEBP，帮助 AI 理解构图与风格</small></div><input type="file" id="file" accept="image/*" hidden></div><div id="refPreview"></div></div><div class="row"><div class="field half"><label>画面比例</label><div class="ratios" id="ratios">${['1:1', '16:9', '9:16', '4:3', '3:4', '3:2'].map((x, i) => `<button class="ratio ${i === 0 ? 'selected' : ''}" data-ratio="${x}">${x}</button>`).join('')}</div></div><div class="field count"><label>批量抽卡 <span class="hint">每条提示词</span></label><div class="stepper"><button id="minus">−</button><strong id="count">1</strong><button id="plus">＋</button></div></div></div><details class="advanced"><summary>高级设置</summary><div class="advanced-grid"><label>API 地址<input id="endpoint" value="https://www.zexitongxue.com"></label><label>模型<input id="model" value="gpt-image-2"></label><label>API Key<input id="apiKey" type="password" placeholder="sk-..."></label></div></details><button class="generate" id="generate"><span>✦</span> 开始生成 <kbd>Ctrl ↵</kbd></button><div id="status"></div></div><div class="panel results"><div class="results-head"><div><h2>生成结果</h2><span id="resultMeta">准备就绪</span></div><button class="icon-btn" title="下载全部" id="download">⇩</button></div><div class="gallery empty" id="gallery"><div class="empty-art">✧</div><b>你的作品会出现在这里</b><span>输入提示词并点击开始生成</span></div></div></section></main>`;
let ref = null,
  count = 1,
  ratio = '1:1';
const $ = (id) => document.getElementById(id);
$('prompt').addEventListener(
  'input',
  (e) => ($('counter').textContent = `${e.target.value.length} / 2000`),
);
$('upload').onclick = () => $('file').click();
$('file').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  ref = {
    name: f.name,
    data: await new Promise((r) => {
      const x = new FileReader();
      x.onload = () => r(x.result);
      x.readAsDataURL(f);
    }),
  };
  $('refPreview').innerHTML =
    `<div class="ref"><img src="${ref.data}"><span>${ref.name}</span><button id="removeRef">×</button></div>`;
  $('removeRef').onclick = () => {
    ref = null;
    $('refPreview').innerHTML = '';
  };
};
document.querySelectorAll('.ratio').forEach(
  (b) =>
    (b.onclick = () => {
      document
        .querySelectorAll('.ratio')
        .forEach((x) => x.classList.remove('selected'));
      b.classList.add('selected');
      ratio = b.dataset.ratio;
    }),
);
$('minus').onclick = () => {
  count = Math.max(1, count - 1);
  $('count').textContent = count;
};
$('plus').onclick = () => {
  count = Math.min(9, count + 1);
  $('count').textContent = count;
};
$('clear').onclick = () => {
  $('prompt').value = '';
  $('prompt').dispatchEvent(new Event('input'));
};
$('saveKey').onclick = () => {
  localStorage.setItem('forge-key', $('apiKey').value);
  $('status').textContent = '配置已保存';
};
$('apiKey').value = localStorage.getItem('forge-key') || '';
$('generate').onclick = async () => {
  const prompt = $('prompt').value.trim();
  if (!prompt) {
    $('status').textContent = '请输入提示词';
    return;
  }
  $('generate').disabled = true;
  $('status').textContent = '正在生成，请稍候…';
  $('gallery').className = 'gallery loading';
  $('gallery').innerHTML =
    '<div class="spinner"></div><span>AI 正在绘制你的画面</span>';
  const r = await window.forge.generate({
    endpoint: $('endpoint').value,
    apiKey: $('apiKey').value,
    model: $('model').value,
    prompt,
    aspect: ratio,
    count,
    reference: ref,
  });
  $('generate').disabled = false;
  if (!r.ok) {
    $('status').textContent = r.error;
    $('gallery').className = 'gallery empty';
    $('gallery').innerHTML =
      '<div class="empty-art">!</div><b>生成失败</b><span>请检查配置后重试</span>';
    return;
  }
  $('status').textContent = '生成完成';
  $('resultMeta').textContent = `${r.images?.length || 0} 张图片`;
  $('gallery').className = 'gallery';
  $('gallery').innerHTML =
    (r.images || [])
      .map((src) => `<img src="${src}" class="result-img">`)
      .join('') || '<div class="empty-art">✓</div><b>任务已提交</b>';
};
window.onkeydown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') $('generate').click();
};
