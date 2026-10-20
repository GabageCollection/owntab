<script setup lang="ts">
import { computed } from 'vue';
import Modal from './Modal.vue';
import ModalActions from './ModalActions.vue';
import { domain, pathLabels, recentNodes, type Node, type RecentEntry } from '../lib/model';

const props = defineProps<{ tree: Node[]; entries: RecentEntry[] }>();
const emit = defineEmits<{ close: []; open: [node: Node]; navigate: [id: string] }>();
const items = computed(() => recentNodes(props.tree, props.entries).map(item => ({
  ...item,
  host: domain(item.node.url),
  path: pathLabels(props.tree, item.node.parentId ?? ''),
})));

function relative(timestamp: number) {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}
</script>

<template>
  <Modal title="最近使用" @close="emit('close')">
    <div class="modal-body recent-body">
      <p v-if="!items.length" class="muted">打开过的书签会出现在这里，最多保留 50 条。</p>
      <div v-else class="recent-list">
        <div v-for="item in items" :key="item.node.id" class="recent-row">
          <button class="recent-main" type="button" @click="emit('open', item.node)">
            <span class="recent-title">{{ item.node.title || item.host || '未命名书签' }}</span>
            <span class="recent-meta muted">{{ item.path || item.host }} · {{ relative(item.openedAt) }}</span>
          </button>
          <button class="button" type="button" @click="emit('navigate', item.node.parentId ?? '')">定位</button>
        </div>
      </div>
    </div>
    <ModalActions :busy="false" :hide-submit="true" @close="emit('close')"/>
  </Modal>
</template>
