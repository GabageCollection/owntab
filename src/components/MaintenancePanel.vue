<script setup lang="ts">
import { computed, ref } from 'vue';
import Modal from './Modal.vue';
import ModalActions from './ModalActions.vue';
import { checkLinks, duplicateGroups, flattenBookmarks, normalizeLinkResult, type LinkStatus, type Node } from '../lib/model';

const props = defineProps<{ tree: Node[]; busy: boolean; error: string }>();
const emit = defineEmits<{ remove: [node: Node]; navigate: [id: string]; close: [] }>();

type Tab = 'duplicates' | 'links';
const tab = ref<Tab>('duplicates');
const allBookmarks = computed(() => flattenBookmarks(props.tree[0]?.children ?? []));
const groups = computed(() => duplicateGroups(props.tree[0]?.children ?? []));
const duplicateCount = computed(() => groups.value.reduce((sum, group) => sum + group.nodes.length - 1, 0));

const MAX_CHECK = 50;
const checking = ref(false);
const checked = ref(false);
const progress = ref(0);
const statuses = ref(new Map<string, LinkStatus>());
let runGeneration = 0;
async function startCheck() {
  const generation = ++runGeneration;
  checking.value = true;
  checked.value = false;
  progress.value = 0;
  statuses.value = new Map();
  const targets = allBookmarks.value.filter(node => /^https?:/i.test(node.url ?? '')).slice(0, MAX_CHECK);
  const total = targets.length || 1;
  let done = 0;
  try {
    for await (const result of checkLinks(targets)) {
      if (generation !== runGeneration) return;
      statuses.value = new Map([...statuses.value, [result.node.id, result.status]]);
      progress.value = ++done / total;
    }
    if (generation === runGeneration) checked.value = true;
  } finally {
    if (generation === runGeneration) checking.value = false;
  }
}
const linkResults = computed(() => [...statuses.value.entries()].map(([id, status]) => ({ node: allBookmarks.value.find(node => node.id === id)!, status })).filter(item => item.node));
const statusLabel: Record<LinkStatus, string> = { ok: '正常', broken: '打不开', unknown: '无法判断' };
</script>

<template>
  <Modal title="书签维护" :busy="busy" @close="emit('close')">
    <div class="modal-body maintenance-body">
      <div class="root-tabs maintenance-tabs" role="tablist">
        <button role="tab" :aria-selected="tab === 'duplicates'" :class="{active: tab === 'duplicates'}" @click="tab = 'duplicates'">重复书签</button>
        <button role="tab" :aria-selected="tab === 'links'" :class="{active: tab === 'links'}" @click="tab = 'links'">链接检查</button>
      </div>

      <template v-if="tab === 'duplicates'">
        <p v-if="groups.length" class="muted">发现 {{ groups.length }} 组重复网址，可删除多余的 {{ duplicateCount }} 项。</p>
        <p v-else class="muted">没有发现重复网址的书签。</p>
        <div v-if="groups.length" class="maintenance-list">
          <section v-for="group in groups" :key="group.url" class="maintenance-group">
            <p class="maintenance-url muted" :title="group.url">{{ group.url }}</p>
            <div v-for="item in group.nodes" :key="item.node.id" class="maintenance-row">
              <span class="maintenance-title">{{ item.node.title || '未命名书签' }}</span>
              <span class="maintenance-path muted">{{ item.path }}</span>
              <button class="button" @click="emit('navigate', item.node.parentId ?? '')">定位</button>
              <button class="button danger" :disabled="busy" @click="emit('remove', item.node)">删除</button>
            </div>
          </section>
        </div>
      </template>

      <template v-else>
        <p class="muted">检查前 {{ Math.min(allBookmarks.length, MAX_CHECK) }} 个 http/https 书签是否还能打开（结果仅供参考，部分网站会拒绝检测）。</p>
        <div class="maintenance-actions">
          <button class="button primary" :disabled="checking || !allBookmarks.length" @click="startCheck">{{ checking ? '检查中…' : checked ? '重新检查' : '开始检查' }}</button>
          <span v-if="checking || checked" class="muted">{{ Math.round(progress * 100) }}%</span>
        </div>
        <div v-if="checking || checked" class="maintenance-progress" role="progressbar" :aria-valuenow="Math.round(progress * 100)" aria-valuemin="0" aria-valuemax="100"><span :style="{width: progress * 100 + '%'}"/></div>
        <div v-if="linkResults.length" class="maintenance-list">
          <div v-for="item in linkResults" :key="item.node.id" class="maintenance-row">
            <span class="maintenance-badge" :data-status="item.status">{{ statusLabel[item.status] }}</span>
            <span class="maintenance-title">{{ item.node.title || '未命名书签' }}</span>
            <button class="button" @click="emit('navigate', item.node.parentId ?? '')">定位</button>
            <button v-if="item.status === 'broken'" class="button danger" :disabled="busy" @click="emit('remove', item.node)">删除</button>
          </div>
        </div>
      </template>
      <p v-if="error" class="field-error" role="alert">✕ {{ error }}</p>
    </div>
    <ModalActions :busy="busy" :hide-submit="true" @close="emit('close')"/>
  </Modal>
</template>
