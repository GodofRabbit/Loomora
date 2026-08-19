const fs = require('fs');
const path = require('path');
const { app, ipcMain } = require('electron');

const QUEUE_FILE = 'generation-queue.json';
const REFERENCE_DIRECTORY = 'GenerationQueueReferences';
const VALID_STATUSES = new Set(['pending', 'running', 'done', 'failed']);
let queueRecovered = false;

function queuePath() {
  return path.join(app.getPath('userData'), QUEUE_FILE);
}

function referenceRoot() {
  return path.join(app.getPath('userData'), REFERENCE_DIRECTORY);
}

function readQueue() {
  try {
    const parsed = JSON.parse(fs.readFileSync(queuePath(), 'utf8'));
    if (!Array.isArray(parsed?.tasks)) return [];
    let changed = false;
    const tasks = parsed.tasks.map((task) => {
      if (queueRecovered || task.status !== 'running') return task;
      changed = true;
      return { ...task, status: 'pending', error: '', updatedAt: Date.now() };
    });
    queueRecovered = true;
    if (changed) writeQueue(tasks);
    return tasks;
  } catch {
    queueRecovered = true;
    return [];
  }
}

function writeQueue(tasks) {
  const target = queuePath();
  const temporary = `${target}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    temporary,
    `${JSON.stringify({ version: 1, tasks }, null, 2)}\n`,
    'utf8',
  );
  fs.renameSync(temporary, target);
}

function parseDataUrl(value) {
  const match = String(value || '').match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) throw new Error('队列中的参考图数据无效');
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

function extensionForMime(mime) {
  if (mime.includes('jpeg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  return 'png';
}

function saveReferences(id, references) {
  const directory = path.join(referenceRoot(), id);
  const saved = [];
  for (let index = 0; index < references.length; index += 1) {
    const { mime, buffer } = parseDataUrl(references[index].data);
    fs.mkdirSync(directory, { recursive: true });
    const filePath = path.join(
      directory,
      `${index + 1}.${extensionForMime(mime)}`,
    );
    fs.writeFileSync(filePath, buffer);
    saved.push({
      name: String(references[index].name || `参考图-${index + 1}`),
      filePath,
      mime,
    });
  }
  return saved;
}

function removeReferences(id) {
  fs.rmSync(path.join(referenceRoot(), id), { recursive: true, force: true });
}

function publicTask(task) {
  const request = task.request || {};
  return {
    id: task.id,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    status: task.status,
    error: task.error || '',
    prompt: String(request.prompt || ''),
    model: String(request.model || ''),
    providerId: String(request.providerId || 'openai-compatible'),
    profileId: String(request.profileId || 'openai-main'),
    conversationId: String(request.conversationId || ''),
    count: Math.max(1, Number(request.count) || 1),
    aspect: String(request.aspect || ''),
    referenceCount: Array.isArray(task.references) ? task.references.length : 0,
  };
}

function addTask(request = {}) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const references = saveReferences(
    id,
    Array.isArray(request.reference) ? request.reference : [],
  );
  const task = {
    id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'pending',
    error: '',
    request: {
      providerId: String(request.providerId || 'openai-compatible'),
      profileId: String(request.profileId || 'openai-main'),
      conversationId: String(request.conversationId || ''),
      endpoint: String(request.endpoint || ''),
      model: String(request.model || ''),
      prompt: String(request.prompt || ''),
      aspect: String(request.aspect || ''),
      size: String(request.size || ''),
      quality: String(request.quality || ''),
      outputFormat: String(request.outputFormat || ''),
      count: Math.max(1, Number(request.count) || 1),
      options:
        request.options && typeof request.options === 'object'
          ? { ...request.options }
          : {},
    },
    references,
  };
  const tasks = [...readQueue(), task];
  writeQueue(tasks);
  return publicTask(task);
}

function hydratedTask(id) {
  const task = readQueue().find((item) => item.id === id);
  if (!task) throw new Error('生成队列任务不存在');
  return {
    ...publicTask(task),
    request: {
      ...task.request,
      reference: (task.references || []).map((item) => ({
        name: item.name,
        data: `data:${item.mime};base64,${fs.readFileSync(item.filePath).toString('base64')}`,
      })),
    },
  };
}

function updateTask(id, status, error = '', conversationId = '') {
  if (!VALID_STATUSES.has(status)) throw new Error('队列状态无效');
  const tasks = readQueue();
  const index = tasks.findIndex((task) => task.id === id);
  if (index < 0) throw new Error('生成队列任务不存在');
  const nextConversationId = String(conversationId || '').trim();
  tasks[index] = {
    ...tasks[index],
    status,
    error: String(error || ''),
    updatedAt: Date.now(),
    request: {
      ...(tasks[index].request || {}),
      ...(nextConversationId ? { conversationId: nextConversationId } : {}),
    },
  };
  if (status === 'done') {
    removeReferences(id);
    tasks[index].references = [];
  }
  writeQueue(tasks);
  return publicTask(tasks[index]);
}

function retryTaskWithService(id, service = {}) {
  const tasks = readQueue();
  const index = tasks.findIndex((task) => task.id === id);
  if (index < 0) throw new Error('生成队列任务不存在');
  if (tasks[index].status === 'running') {
    throw new Error('正在生成的任务不能重试');
  }
  tasks[index] = {
    ...tasks[index],
    status: 'pending',
    error: '',
    updatedAt: Date.now(),
    request: {
      ...(tasks[index].request || {}),
      providerId: String(service.providerId || 'openai-compatible'),
      profileId: String(service.profileId || 'openai-main'),
      endpoint: String(service.endpoint || ''),
      model: String(service.model || ''),
    },
  };
  writeQueue(tasks);
  return publicTask(tasks[index]);
}

function removeTask(id) {
  const tasks = readQueue();
  const next = tasks.filter((task) => task.id !== id);
  if (next.length === tasks.length) return false;
  removeReferences(id);
  writeQueue(next);
  return true;
}

function clearFinishedTasks() {
  const tasks = readQueue();
  const removable = tasks.filter((task) =>
    ['done', 'failed'].includes(task.status),
  );
  removable.forEach((task) => removeReferences(task.id));
  writeQueue(tasks.filter((task) => !removable.includes(task)));
  return removable.length;
}

function clearGenerationQueueData() {
  queueRecovered = true;
  fs.rmSync(queuePath(), { force: true });
  fs.rmSync(`${queuePath()}.tmp`, { force: true });
  fs.rmSync(referenceRoot(), { recursive: true, force: true });
}

function registerGenerationQueueHandlers() {
  ipcMain.handle('list-generation-queue', () => readQueue().map(publicTask));
  ipcMain.handle('enqueue-generation-task', (_event, request) =>
    addTask(request),
  );
  ipcMain.handle('get-generation-queue-task', (_event, id) =>
    hydratedTask(String(id || '')),
  );
  ipcMain.handle('update-generation-queue-task', (_event, payload) =>
    updateTask(
      String(payload?.id || ''),
      String(payload?.status || ''),
      payload?.error,
      payload?.conversationId,
    ),
  );
  ipcMain.handle('retry-generation-queue-task', (_event, payload) =>
    retryTaskWithService(String(payload?.id || ''), payload),
  );
  ipcMain.handle('remove-generation-queue-task', (_event, id) =>
    removeTask(String(id || '')),
  );
  ipcMain.handle('clear-finished-generation-tasks', () => clearFinishedTasks());
}

module.exports = {
  clearGenerationQueueData,
  registerGenerationQueueHandlers,
};
