<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Icon from './Icon.vue';
import { domain, faviconColor, safeHref, type Node } from '../lib/model';

const props = defineProps<{ nodes: Node[]; newTab: boolean; busy?: boolean }>();
const emit = defineEmits<{ unpin: [id: string]; open: [node: Node, mode: 'app' | 'native']; reorder: [source: string, target: string, position: 'before' | 'after'] }>();
const dragging = ref('');
const dropTarget = ref<{ id: string; position: 'before' | 'after' } | null>(null);
function start(node: Node, event: DragEvent) {
  if (!event.dataTransfer || props.busy) { event.preventDefault(); return; }
  dragging.value = node.id;
  event.dataTransfer.setData('application/x-owntab-pin', node.id);
  event.dataTransfer.effectAllowed = 'move';
}
function over(node: Node, event: DragEvent) {
  if (props.busy || !dragging.value || dragging.value === node.id) { dropTarget.value = null; return; }
  event.preventDefault();
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  dropTarget.value = { id: node.id, position: event.clientX < rect.left + rect.width / 2 ? 'before' : 'after' };
}
function drop(node: Node, event: DragEvent) {
  event.preventDefault();
  if (!props.busy && dragging.value && dropTarget.value?.id === node.id) emit('reorder', dragging.value, node.id, dropTarget.value.position);
  end();
}
function end() { dragging.value = ''; dropTarget.value = null; }
function keys(event: KeyboardEvent, node: Node) {
  if (event.isComposing || props.busy || !event.altKey || !event.shiftKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  const index = props.nodes.findIndex(item => item.id === node.id);
  const target = props.nodes[index + (event.key === 'ArrowLeft' ? -1 : 1)];
  if (target) emit('reorder', node.id, target.id, event.key === 'ArrowLeft' ? 'before' : 'after');
}
const failed = ref(new Set<string>());
watch(() => props.nodes, () => failed.value = new Set());
function favicon(node: Node) {
  try {
    const base = chrome?.runtime?.getURL?.('/_favicon/') ?? '';
    const url = new URL(base, location.href);
    url.searchParams.set('pageUrl', node.url!);
    url.searchParams.set('size', '32');
    return url.href;
  } catch { return ''; }
}
function safeUrl(node: Node) { return safeHref(node.url); }
const colored = computed(() => props.nodes.map(node => { const host = domain(node.url); return { node, host, colors: faviconColor(host), url: safeUrl(node) }; }));
function onClick(event: MouseEvent, node: Node) {
  const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  if (plain) { event.preventDefault(); emit('open', node, 'app'); return; }
  emit('open', node, 'native');
}
</script>

<template>
  <section v-if="nodes.length" class="pinned-bar" aria-label="固定书签">
    <span v-for="item in colored" :key="item.node.id" class="pinned-item" :class="{dragging:dragging === item.node.id, 'drag-before':dropTarget?.id === item.node.id && dropTarget.position === 'before', 'drag-after':dropTarget?.id === item.node.id && dropTarget.position === 'after'}" :draggable="!busy" @dragstart="start(item.node,$event)" @dragover="over(item.node,$event)" @drop="drop(item.node,$event)" @dragend="end">
      <a class="pinned-link" :data-pin-id="item.node.id" :href="item.url" :target="newTab ? '_blank' : undefined" rel="noopener noreferrer" :title="`${item.node.url} · 拖动排序，或 Alt+Shift+←/→ 调整顺序`" @keydown="keys($event,item.node)" @click="onClick($event, item.node)">
        <span class="favicon pinned-favicon" :style="{'--favicon-bg': item.colors[0], '--favicon-text': item.colors[1]}">
          <img loading="lazy" v-if="favicon(item.node) && !failed.has(item.node.id)" :src="favicon(item.node)" alt="" width="20" height="20" @error="failed = new Set([...failed, item.node.id])">
          <span v-else>{{ item.host.charAt(0).toUpperCase() || '?' }}</span>
        </span>
        <span class="pinned-title">{{ item.node.title || item.host || '未命名' }}</span>
      </a>
      <button class="icon-button pinned-remove" :disabled="busy" :aria-label="`取消固定：${item.node.title}`" title="取消固定" @click="emit('unpin', item.node.id)"><Icon name="close"/></button>
    </span>
  </section>
</template>
