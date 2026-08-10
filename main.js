const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

async function persistImages(urls) {
  const date = new Date().toISOString().slice(0, 10)
  let dir = path.join(path.dirname(process.execPath), 'Gallery', date)
  try { fs.mkdirSync(dir, { recursive: true }) } catch { dir = path.join(app.getPath('userData'), 'Gallery', date); fs.mkdirSync(dir, { recursive: true }) }
  const display = [], localPaths = []
  for (let i = 0; i < (urls || []).length; i++) { const src = urls[i]; let buffer, ext = 'png'; if (src.startsWith('data:')) { ext = (src.match(/^data:image\/(\w+)/) || [,'png'])[1]; buffer = Buffer.from(src.split(',')[1], 'base64') } else { const q = await fetch(src); buffer = Buffer.from(await q.arrayBuffer()); ext = ((src.match(/\.([a-z\d]+)(?:\?|$)/i) || [,'png'])[1] || 'png').toLowerCase() } const file = path.join(dir, `loomora-${Date.now()}-${i + 1}.${ext}`); fs.writeFileSync(file, buffer); localPaths.push(file); display.push(`data:image/${ext};base64,${buffer.toString('base64')}`) }
  return { display, localPaths, dir }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#f5f7fb',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.setMenuBarVisibility(false)
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL)
  else win.loadFile(path.join(__dirname, 'renderer-dist', 'index.html'))
}
app.whenReady().then(() => {
  createWindow()
  app.on(
    'activate',
    () => BrowserWindow.getAllWindows().length === 0 && createWindow(),
  )
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('pick-image', async () => {
  const r = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  })
  if (r.canceled || !r.filePaths[0]) return null
  const p = r.filePaths[0]
  return {
    name: path.basename(p),
    data: `data:image/${path.extname(p).slice(1)};base64,${fs.readFileSync(p).toString('base64')}`,
  }
})
ipcMain.handle('generate', async (_e, payload) => {
  const { endpoint, apiKey, model, prompt, aspect, count, reference } = payload
  if (!apiKey) return { ok: false, error: '请先填写 API Key' }
  const url =
    (endpoint || 'https://www.zexitongxue.com').replace(/\/$/, '') +
    '/v1/images/generations/async'
  try {
    const body = {
      model: model || 'gpt-image-2',
      prompt,
      n: count || 1,
      aspect,
      size: aspect,
      quality: 'high',
    }
    if (reference?.length) {
      body.reference_images = reference.map((item) => item.data)
      body.reference_image = reference[0].data
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok)
      return {
        ok: false,
        error:
          json?.error?.message || json?.message || `请求失败 (${res.status})`,
      }
    const taskId = json.task_id || json.id || json.data?.task_id
    if (!taskId) { const saved = await persistImages((json.data || []).map((x) => x.url).filter(Boolean)); return { ok: true, images: saved.display, localPaths: saved.localPaths, folder: saved.dir } }
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 2500))
      const q = await fetch(
        `${(endpoint || 'https://www.zexitongxue.com').replace(/\/$/, '')}/v1/images/tasks/${taskId}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      )
      const d = await q.json()
      if (
        ['succeeded', 'completed', 'success'].includes(
          String(d.status).toLowerCase(),
        )
      ) {
        const imgs = d.result_url
          ? [d.result_url]
          : (d.data || []).map((x) => x.url || x.result_url).filter(Boolean)
        const saved = await persistImages(imgs); return { ok: true, images: saved.display, localPaths: saved.localPaths, folder: saved.dir }
      }
      if (['failed', 'error'].includes(String(d.status).toLowerCase()))
        return { ok: false, error: d.message || '生成失败' }
    }
    return { ok: false, error: '任务超时，请稍后在历史记录中查看' }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})
