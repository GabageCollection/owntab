<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import Modal from './Modal.vue';
import { domain, folderPath, scoreQuery, searchUrl, type Node, type TagMap } from '../lib/model';

const props = defineProps<{ tree: Node[]; pinnedIds?: string[]; tags?: TagMap; engineId?: string; newTab?: boolean; initialQuery?: string }>();
const emit = defineEmits<{ close: []; navigate: [id: string]; open: [node: Node] }>();

interface Result {
  key: string;
  node: Node;
  host: string;
  path: string;
  score: number;
  kind: 'bookmark' | 'folder';
  pinned: boolean;
}

const query = ref(props.initialQuery ?? '');
const active = ref(0);
const input = ref<HTMLInputElement>();
const list = ref<HTMLElement>();

const groups = computed(() => {
  const q = query.value.trim();
  if (!q) return { pinned: [] as Result[], bookmarks: [] as Result[], folders: [] as Result[] };
  const matches: Result[] = [];
  const pinned = new Set(props.pinnedIds ?? []);
  for (const root of props.tree[0]?.children ?? []) collect(root);

  function collect(node: Node) {
    const host = node.url ? domain(node.url) : '';
    const tagText = (props.tags?.[node.id] ?? []).join(' ');
    const score = scoreQuery(node.title ?? '', node.url ?? '', `${host} ${tagText}`.trim(), q);
    if (score !== undefined) {
      matches.push({
        key: node.id,
        node,
        host,
        path: folderPath(props.tree, node.parentId ?? '').map(item => item.title).filter(Boolean).join(' / '),
        score,
        kind: node.url ? 'bookmark' : 'folder',
        pinned: !!node.url && pinned.has(node.id),
      });
    }
    for (const child of node.children ?? []) collect(child);
  }

  const ordered = matches.sort((a, b) => a.score - b.score || a.node.title.localeCompare(b.node.title)).slice(0, 30);
  return {
    pinned: ordered.filter(item => item.pinned),
    bookmarks: ordered.filter(item => item.kind === 'bookmark' && !item.pinned),
    folders: ordered.filter(item => item.kind === 'folder'),
  };
});

const results = computed(() => [...groups.value.pinned, ...groups.value.bookmarks, ...groups.value.folders]);
const engineUrl = computed(() => searchUrl(query.value, props.engineId ?? 'google'));
watch(query, () => active.value = 0);
watch(results, value => { if (active.value >= value.length) active.value = 0; });

function keys(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    openEngine();
    return;
  }
  if (!results.value.length) {
    if (event.key === 'Enter') { event.preventDefault(); openEngine(); }
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    active.value = (active.value + (event.key === 'ArrowDown' ? 1 : -1) + results.value.length) % results.value.length;
    list.value?.querySelectorAll<HTMLElement>('.palette-item')[active.value]?.scrollIntoView({ block: 'nearest' });
  }
  if (event.key === 'Enter') { event.preventDefault(); choose(results.value[active.value]); }
}

function choose(result?: Result) {
  if (!result) return;
  if (result.kind === 'folder') emit('navigate', result.node.id);
  else emit('open', result.node);
  emit('close');
}

function openEngine() {
  if (!query.value.trim()) return;
  if (props.newTab) window.open(engineUrl.value, '_blank', 'noopener,noreferrer');
  else location.href = engineUrl.value;
  emit('close');
}

nextTick(() => input.value?.focus());
</script>

<template>
  <Modal title="搜索书签" @close="emit('close')">
    <div class="modal-body palette-body" @keydown="keys" @keydown.esc.stop.prevent="emit('close')">
      <input ref="input" v-model="query" class="palette-input" type="search" placeholder="搜索标题、网址、文件夹或标签…" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-label="搜索书签" spellcheck="false">
      <div v-if="query.trim() && !results.length" class="palette-empty">
        <p class="muted">没有找到匹配「{{ query.trim() }}」的书签或文件夹。</p>
        <button class="button primary" type="button" @click="openEngine">在网页中搜索</button>
      </div>
      <div v-else-if="results.length" ref="list" id="palette-list" class="palette-list" role="listbox">
        <template v-for="group in [
          { label: '已固定', items: groups.pinned },
          { label: '书签', items: groups.bookmarks },
          { label: '文件夹', items: groups.folders },
        ]" :key="group.label">
          <template v-if="group.items.length">
            <p class="palette-group-label">{{ group.label }}</p>
            <button
              v-for="result in group.items"
              :key="result.key"
              class="palette-item"
              :class="{ active: results.indexOf(result) === active }"
              role="option"
              :aria-selected="results.indexOf(result) === active"
              type="button"
              @mousemove="active = results.indexOf(result)"
              @click="choose(result)"
            >
              <span class="palette-item-main">
                <span class="palette-item-title">{{ result.node.title || result.host || '未命名' }}</span>
                <span class="palette-item-url muted">{{ result.kind === 'folder' ? '文件夹' : result.host || result.node.url }}</span>
              </span>
              <span class="palette-item-path muted" :title="result.path">{{ result.path }}</span>
              <span v-if="result.pinned" class="palette-pin" aria-label="已固定">★</span>
            </button>
          </template>
        </template>
      </div>
      <div v-if="query.trim()" class="palette-engine">
        <span class="muted">网页搜索</span>
        <button class="button" type="button" @click="openEngine">{{ query.trim() }}</button>
      </div>
      <p class="muted palette-hint">↑↓ 选择 · Enter 打开 · ⌘/Ctrl+Enter 网页搜索 · Esc 关闭</p>
    </div>
  </Modal>
</template>
