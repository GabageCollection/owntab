<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import Modal from './Modal.vue';
import { domain, folderPath, scoreQuery, type Node } from '../lib/model';

const props = defineProps<{ tree: Node[] }>();
const emit = defineEmits<{ close: []; navigate: [id: string] }>();

interface Result { node: Node; host: string; path: string; score: number }
const query = ref('');
const active = ref(0);
const input = ref<HTMLInputElement>();
const list = ref<HTMLElement>();

const results = computed<Result[]>(() => {
  const q = query.value.trim();
  if (!q) return [];
  const matches: Result[] = [];
  for (const root of props.tree[0]?.children ?? []) collect(root);
  function collect(node: Node) {
    if (node.url) {
      const host = domain(node.url);
      const score = scoreQuery(node.title ?? '', node.url, host, q);
      if (score !== undefined) matches.push({ node, host, path: folderPath(props.tree, node.parentId ?? '').map(n => n.title).filter(Boolean).join(' / '), score });
    }
    for (const child of node.children ?? []) collect(child);
  }
  matches.sort((a, b) => a.score - b.score || a.node.title.localeCompare(b.node.title));
  return matches.slice(0, 20);
});
watch(query, () => active.value = 0);
watch(results, value => { if (active.value >= value.length) active.value = 0; });

function keys(event: KeyboardEvent) {
  if (!results.value.length) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    active.value = (active.value + (event.key === 'ArrowDown' ? 1 : -1) + results.value.length) % results.value.length;
    list.value?.children[active.value]?.scrollIntoView({ block: 'nearest' });
  }
  if (event.key === 'Enter') { event.preventDefault(); open(results.value[active.value]); }
}
function open(result?: Result) {
  if (!result) return;
  const anchor = document.getElementById(`palette-result-${result.node.id}`) as HTMLAnchorElement | null;
  anchor?.click();
  emit('close');
}
function locate(result: Result) {
  emit('navigate', result.node.parentId ?? '');
  emit('close');
}
nextTick(() => input.value?.focus());
</script>

<template>
  <Modal title="搜索书签" @close="emit('close')">
    <div class="modal-body palette-body" @keydown="keys" @keydown.esc.stop.prevent="emit('close')">
      <input ref="input" v-model="query" class="palette-input" type="search" placeholder="搜索标题或网址…" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-label="搜索书签" spellcheck="false">
      <div v-if="query.trim() && !results.length" class="palette-empty muted">没有找到匹配「{{ query.trim() }}」的书签</div>
      <div v-else-if="results.length" ref="list" id="palette-list" class="palette-list" role="listbox">
        <a v-for="(result, i) in results" :key="result.node.id" :id="`palette-result-${result.node.id}`" class="palette-item" :class="{active: i === active}" role="option" :aria-selected="i === active" :href="result.node.url" target="_blank" rel="noopener noreferrer" @mousemove="active = i" @click.prevent="open(result)">
          <span class="palette-item-main">
            <span class="palette-item-title">{{ result.node.title || result.host || '未命名书签' }}</span>
            <span class="palette-item-url muted">{{ result.host || result.node.url }}</span>
          </span>
          <span class="palette-item-path muted" :title="result.path">{{ result.path }}</span>
          <button class="icon-button palette-locate" :aria-label="`定位到：${result.path || '所在目录'}`" title="打开所在文件夹" @click.stop.prevent="locate(result)">⌂</button>
        </a>
      </div>
      <p class="muted palette-hint">↑↓ 选择 · Enter 打开 · ⌂ 定位到所在目录 · Esc 关闭</p>
    </div>
  </Modal>
</template>
