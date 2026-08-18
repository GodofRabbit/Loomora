<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  CirclePause,
  CirclePlay,
  ListOrdered,
  MessageSquareText,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-vue-next';

const props = defineProps({
  tasks: { type: Array, default: () => [] },
  paused: Boolean,
  activeTaskId: { type: String, default: '' },
});
const emit = defineEmits([
  'toggle-pause',
  'retry',
  'remove',
  'clear-finished',
  'locate',
]);
const root = ref(null);
const open = ref(false);
const pendingCount = computed(
  () => props.tasks.filter((task) => task.status === 'pending').length,
);
const activeCount = computed(
  () => props.tasks.filter((task) => task.status === 'running').length,
);
const finishedCount = computed(
  () =>
    props.tasks.filter((task) => ['done', 'failed'].includes(task.status))
      .length,
);
const displayTasks = computed(() =>
  [...props.tasks].sort(
    (first, second) =>
      (Number(second.createdAt) || 0) - (Number(first.createdAt) || 0),
  ),
);

const statusText = {
  pending: '等待中',
  running: '生成中',
  done: '已完成',
  failed: '失败',
};

function taskTime(value) {
  return new Date(Number(value) || Date.now()).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function closeQueue() {
  open.value = false;
}

function closeFromOutside(event) {
  if (!open.value) return;
  if (root.value?.contains(event.target)) return;
  closeQueue();
}

function canLocateTask(task) {
  return task?.status === 'running' && Boolean(task.conversationId);
}

function locateTask(task) {
  if (!canLocateTask(task)) return;
  emit('locate', task);
  closeQueue();
}

onMounted(() => {
  document.addEventListener('pointerdown', closeFromOutside, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeFromOutside, true);
});
</script>

<template>
  <div
    ref="root"
    class="generation-queue-shell"
    @click.stop
    @mousedown.prevent.stop
  >
    <button
      type="button"
      class="generation-queue-trigger"
      :class="{ active: open }"
      title="查看生成队列"
      aria-label="查看生成队列"
      @click="open = !open"
    >
      <ListOrdered aria-hidden="true" />
      <span v-if="pendingCount + activeCount">{{
        pendingCount + activeCount
      }}</span>
    </button>
    <Transition name="generation-queue">
      <aside v-if="open" class="generation-queue-panel" aria-label="生成队列">
        <header>
          <div>
            <b>生成队列</b>
            <span>{{
              paused ? '已暂停' : `${pendingCount} 个任务等待执行`
            }}</span>
          </div>
          <button type="button" title="关闭队列" @click="closeQueue">
            <X aria-hidden="true" />
          </button>
        </header>
        <div class="generation-queue-tools">
          <button type="button" @click="emit('toggle-pause')">
            <CirclePlay v-if="paused" aria-hidden="true" />
            <CirclePause v-else aria-hidden="true" />
            {{ paused ? '继续队列' : '暂停队列' }}
          </button>
          <button
            type="button"
            :disabled="!finishedCount"
            @click="emit('clear-finished')"
          >
            <Trash2 aria-hidden="true" />清理记录
          </button>
        </div>
        <div class="generation-queue-list">
          <article
            v-for="task in displayTasks"
            :key="task.id"
            :class="[task.status, { locatable: canLocateTask(task) }]"
            :role="canLocateTask(task) ? 'button' : undefined"
            :tabindex="canLocateTask(task) ? 0 : undefined"
            :title="canLocateTask(task) ? '跳转到正在生成的对话' : undefined"
            @click="locateTask(task)"
            @keydown.enter.prevent="locateTask(task)"
            @keydown.space.prevent="locateTask(task)"
          >
            <div class="generation-queue-item-head">
              <span>{{ statusText[task.status] || task.status }}</span>
              <small>
                <MessageSquareText
                  v-if="canLocateTask(task)"
                  aria-hidden="true"
                />
                {{ taskTime(task.createdAt) }}
              </small>
            </div>
            <p>{{ task.prompt }}</p>
            <small>
              {{ task.model }} · {{ task.aspect }} · {{ task.count }} 张
              <template v-if="task.referenceCount">
                · {{ task.referenceCount }} 张参考图
              </template>
            </small>
            <em v-if="task.error">{{ task.error }}</em>
            <div
              v-if="task.status === 'failed' || task.status === 'pending'"
              class="generation-queue-item-actions"
            >
              <button
                v-if="task.status === 'failed'"
                type="button"
                title="重试任务"
                @click.stop="emit('retry', task)"
              >
                <RotateCcw aria-hidden="true" />重试
              </button>
              <button
                type="button"
                title="移除任务"
                :disabled="task.id === activeTaskId"
                @click.stop="emit('remove', task)"
              >
                <Trash2 aria-hidden="true" />移除
              </button>
            </div>
          </article>
          <div v-if="!tasks.length" class="generation-queue-empty">
            <ListOrdered aria-hidden="true" />
            <b>队列为空</b>
            <span>新生成任务会显示在这里</span>
          </div>
        </div>
      </aside>
    </Transition>
  </div>
</template>
