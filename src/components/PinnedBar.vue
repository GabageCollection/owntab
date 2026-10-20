<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Icon from './Icon.vue';
import { domain, faviconColor, safeHref, type Node } from '../lib/model';

const props = defineProps<{ nodes: Node[]; newTab: boolean }>();
const emit = defineEmits<{ unpin: [id: string]; open: [node: Node, mode: 'app' | 'native'] }>();
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
    <span v-for="item in colored" :key="item.node.id" class="pinned-item">
      <a class="pinned-link" :href="item.url" :target="newTab ? '_blank' : undefined" rel="noopener noreferrer" :title="item.node.url" @click="onClick($event, item.node)">
        <span class="favicon pinned-favicon" :style="{'--favicon-bg': item.colors[0], '--favicon-text': item.colors[1]}">
          <img v-if="favicon(item.node) && !failed.has(item.node.id)" :src="favicon(item.node)" alt="" width="20" height="20" @error="failed = new Set([...failed, item.node.id])">
          <span v-else>{{ item.host.charAt(0).toUpperCase() || '?' }}</span>
        </span>
        <span class="pinned-title">{{ item.node.title || item.host || '未命名' }}</span>
      </a>
      <button class="icon-button pinned-remove" :aria-label="`取消固定：${item.node.title}`" title="取消固定" @click="emit('unpin', item.node.id)"><Icon name="close"/></button>
    </span>
  </section>
</template>
