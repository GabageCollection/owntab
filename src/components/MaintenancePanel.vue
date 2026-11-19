<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Modal from './Modal.vue';
import ModalActions from './ModalActions.vue';
import { checkLinks, duplicateGroups, findNode, flattenBookmarks, safeHref, type LinkStatus, type Node } from '../lib/model';

const props = defineProps<{ tree: Node[]; busy: boolean; error: string; removedIds?: string[]; currentFolderId: string }>();
const emit = defineEmits<{ remove: [node: Node]; batchRemove: [nodes: Node[], keeper: Node]; locate: [node: Node]; close: [] }>();

type Tab = 'duplicates' | 'links';
const tab = ref<Tab>('duplicates');
const allBookmarks = computed(() => flattenBookmarks(props.tree[0]?.children ?? []));
const groups = computed(() => duplicateGroups(props.tree[0]?.children ?? []));
const removed = computed(() => new Set(props.removedIds ?? []));
const visibleGroups = computed(() => groups.value.map(group => ({ ...group, nodes: group.nodes.filter(item => !removed.value.has(item.node.id)) })).filter(group => group.nodes.length > 1));
const visibleCount = computed(() => visibleGroups.value.reduce((sum, group) => sum + group.nodes.length - 1, 0));
const cleaningGroup = ref('');
const keepers = ref<Record<string, string>>({});
function cleanGroup(group: { url: string; nodes: { node: Node }[] }) {
  cleaningGroup.value = group.url;
  const keeper = group.nodes.find(item => item.node.id === keepers.value[group.url])?.node ?? group.nodes[0]?.node;
  if (keeper) emit('batchRemove', group.nodes.filter(item => item.node.id !== keeper.id).map(item => item.node), keeper);
}

const selectedIds = ref<string[]>([]);
const scope = ref<'all' | 'folder' | 'selected'>('all');
const currentFolder = computed(() => findNode(props.tree, props.currentFolderId));
const targets = computed(() => {
  const chosen = scope.value === 'selected' ? new Set(selectedIds.value) : undefined;
  const source = scope.value === 'folder' && currentFolder.value ? flattenBookmarks([currentFolder.value]) : allBookmarks.value;
  return source.filter(node => safeHref(node.url) && (!chosen || chosen.has(node.id)));
});
const checking = ref(false);
const checked = ref(false);
const stopped = ref(false);
const progress = ref(0);
const statuses = ref(new Map<string, { url?: string; status: LinkStatus }>());
const previousTargets = ref<Node[]>([]);
let activeCheck: AbortController | undefined;
onBeforeUnmount(() => activeCheck?.abort());
async function startCheck() {
  const selected = targets.value;
  if (checking.value || !selected.length) return;
  const controller = new AbortController();
  activeCheck = controller;
  previousTargets.value = selected;
  checking.value = true;
  stopped.value = false;
  checked.value = false;
  progress.value = 0;
  statuses.value = new Map();
  let done = 0;
  try {
    for await (const { node, status } of checkLinks(selected, { signal: controller.signal })) {
      statuses.value.set(node.id, { url: node.url, status });
      progress.value = ++done / selected.length;
    }
    if (activeCheck === controller) {
      if (!controller.signal.aborted) checked.value = true;
      else stopped.value = true;
    }
  } finally {
    if (activeCheck === controller) {
      activeCheck = undefined;
      checking.value = false;
    }
  }
}
async function retryCheck() {
  const selected = previousTargets.value.filter(node => statuses.value.get(node.id)?.status !== 'ok');
  if (checking.value || !selected.length) return;
  const controller = new AbortController();
  activeCheck = controller;
  checking.value = true;
  stopped.value = false;
  checked.value = false;
  progress.value = 0;
  statuses.value = new Map([...statuses.value].filter(([id]) => !selected.some(node => node.id === id)));
  let done = 0;
  try {
    for await (const { node, status } of checkLinks(selected, { signal: controller.signal })) {
      statuses.value.set(node.id, { url: node.url, status });
      progress.value = ++done / selected.length;
    }
    if (activeCheck === controller) {
      if (!controller.signal.aborted) checked.value = true;
      else stopped.value = true;
    }
  } finally {
    if (activeCheck === controller) {
      activeCheck = undefined;
      checking.value = false;
    }
  }
}
function clearCheckState() {
  if (checking.value) {
    const previous = activeCheck;
    activeCheck = undefined;
    checking.value = false;
    previous?.abort();
  }
  previousTargets.value = [];
  statuses.value = new Map();
  checked.value = false;
  stopped.value = false;
  progress.value = 0;
}
watch([scope, () => props.currentFolderId], clearCheckState);
watch(selectedIds, () => {
  if (scope.value === 'selected') clearCheckState();
});
const byId = computed(() => new Map(allBookmarks.value.map(node => [node.id, node])));
const linkResults = computed(() => [...statuses.value].flatMap(([id, result]) => {
  const node = byId.value.get(id);
  return node && node.url === result.url ? [{ node, status: result.status }] : [];
}));
const statusLabel: Record<LinkStatus, string> = { ok: '正常', broken: '打不开', unknown: '无法判断' };
const visibleLinks = computed(() => linkResults.value.filter(item => !removed.value.has(item.node.id)));
const retryCount = computed(() => previousTargets.value.filter(node => statuses.value.get(node.id)?.status !== 'ok').length);
</script>

<template>
  <Modal title="书签维护" :busy="busy" @close="emit('close')">
    <div class="modal-body maintenance-body">
      <div class="root-tabs maintenance-tabs" role="tablist">
        <button role="tab" :aria-selected="tab === 'duplicates'" :class="{active: tab === 'duplicates'}" @click="tab = 'duplicates'">重复书签</button>
        <button role="tab" :aria-selected="tab === 'links'" :class="{active: tab === 'links'}" @click="tab = 'links'">链接检查</button>
      </div>

      <template v-if="tab === 'duplicates'">
        <p v-if="visibleGroups.length" class="muted">发现 {{ visibleGroups.length }} 组重复网址，可删除多余的 {{ visibleCount }} 项。</p>
        <p v-else class="muted">没有发现重复网址的书签。</p>
        <div v-if="visibleGroups.length" class="maintenance-list">
          <section v-for="group in visibleGroups" :key="group.url" class="maintenance-group">
            <p class="maintenance-url muted" :title="group.url">{{ group.url }}</p>
            <div v-for="item in group.nodes" :key="item.node.id" class="maintenance-row">
              <span class="maintenance-title">{{ item.node.title || '未命名书签' }}</span>
              <span class="maintenance-path muted">{{ item.path }}</span>
              <button class="button" @click="emit('locate', item.node)">定位</button>
              <button class="button danger" :disabled="busy" @click="emit('remove', item.node)">删除</button>
            </div>
            <label class="field">保留书签<select v-model="keepers[group.url]" :aria-label="`保留项：${group.url}`"><option v-for="item in group.nodes" :key="item.node.id" :value="item.node.id">{{ item.node.title || item.node.url }}（{{ item.path }}）</option></select></label>
            <button class="button danger" :disabled="busy || cleaningGroup === group.url" @click="cleanGroup(group)">{{ cleaningGroup === group.url ? '已提交清理' : '预览并清理重复项' }}</button>
          </section>
        </div>
      </template>

      <template v-else>
        <label class="field">检查范围<select v-model="scope" aria-label="检查范围" :disabled="checking"><option value="all">全部书签</option><option value="folder">当前文件夹及子文件夹</option><option value="selected">选中书签（{{ selectedIds.length }}）</option></select></label>
        <label v-if="scope === 'selected'" class="field">选择书签<select v-model="selectedIds" multiple size="5" aria-label="选择待检查书签" :disabled="checking"><option v-for="node in allBookmarks.filter(item => safeHref(item.url))" :key="node.id" :value="node.id">{{ node.title || node.url }}</option></select></label>
        <p class="muted">将向 {{ targets.length }} 个 http/https 书签的目标站点发起请求。最多并发 4 个；404/410 标为明确失效，其他不可达情况标为「无法判断」。检查不会删除书签。</p>
        <div class="maintenance-actions">
          <button class="button primary" :disabled="checking || !targets.length" @click="startCheck">{{ checking ? '检查中…' : checked ? '重新检查' : '开始检查' }}</button>
          <button v-if="checking" class="button" @click="activeCheck?.abort()">取消检查</button>
          <button v-if="(checked || stopped) && retryCount" class="button" :disabled="checking" @click="retryCheck">重试未通过项（{{ retryCount }}）</button>
          <span v-if="checking || checked" class="muted">{{ Math.round(progress * 100) }}%</span>
        </div>
        <div v-if="checking || checked" class="maintenance-progress" role="progressbar" :aria-valuenow="Math.round(progress * 100)" aria-valuemin="0" aria-valuemax="100"><span :style="{width: progress * 100 + '%'}"/></div>
        <div v-if="visibleLinks.length" class="maintenance-list">
          <div v-for="item in visibleLinks" :key="item.node.id" class="maintenance-row">
            <span class="maintenance-badge" :data-status="item.status">{{ statusLabel[item.status] }}</span>
            <span class="maintenance-title">{{ item.node.title || '未命名书签' }}</span>
            <button class="button" @click="emit('locate', item.node)">定位</button>
            <button v-if="item.status === 'broken'" class="button danger" :disabled="busy" @click="emit('remove', item.node)">删除</button>
          </div>
        </div>
      </template>
      <p v-if="error" class="field-error" role="alert">✕ {{ error }}</p>
    </div>
    <ModalActions :busy="busy" :hide-submit="true" @close="emit('close')"/>
  </Modal>
</template>
