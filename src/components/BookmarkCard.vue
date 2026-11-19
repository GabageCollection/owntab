<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { domain, faviconColor, safeHref, type Node } from '../lib/model';
const props = defineProps<{ node: Node; newTab: boolean; menuOpen?: boolean; note?: string; selectable?: boolean; selected?: boolean }>();
const tags = defineModel<string[]>('tags', { default: () => [] });
const emit = defineEmits<{ menu: [node: Node, event: MouseEvent]; open: [node: Node, mode: 'app' | 'native']; dragstart: [node: Node, event: DragEvent]; dragend: []; select: [node: Node] }>();
const failed = ref(false);
watch(() => props.node.url, () => failed.value = false);
const host = computed(() => domain(props.node.url));
const colors = computed(() => faviconColor(host.value));
const favicon = computed(() => { try { const url = new URL(chrome.runtime.getURL('/_favicon/'), location.href); url.searchParams.set('pageUrl',props.node.url!); url.searchParams.set('size','32'); return url.href; } catch { return ''; } });
const safeUrl = computed(() => safeHref(props.node.url));
// Plain clicks are handled by the app so the "recent" write finishes before navigation.
function onClick(event: MouseEvent) {
  const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  if (plain) { event.preventDefault(); emit('open', props.node, 'app'); return; }
  emit('open', props.node, 'native');
}
</script>
<template><article class="bookmark-card" :class="{selected,selectable}"><input v-if="selectable" class="bookmark-select" type="checkbox" :checked="selected" :aria-label="`选择：${node.title || host}`" @click.stop="$emit('select',node)"><a class="card-link" :data-node-id="node.id" :href="safeUrl" :target="newTab ? '_blank' : undefined" rel="noopener noreferrer" :title="[node.url,note].filter(Boolean).join('\n')" :aria-label="`${node.title || host}${safeUrl ? '' : '（此网址不能从扩展打开）'}${note ? `，备注：${note}` : ''}`" @click="onClick"><span class="favicon" :style="{'--favicon-bg':colors[0],'--favicon-text':colors[1]}"><img loading="lazy" v-if="favicon && !failed" :src="favicon" alt="" width="20" height="20" @error="failed = true"><span v-else>{{ host.charAt(0).toUpperCase() || '?' }}</span></span><span class="card-copy"><span class="card-title">{{ node.title || host || '未命名书签' }}</span><span class="card-domain">{{ host || '特殊网址' }}<span v-if="tags.length" class="card-tags" :title="tags.join(' · ')"> · {{ tags.slice(0, 2).join(' · ') }}<span v-if="tags.length > 2"> +{{ tags.length - 2 }}</span></span></span></span></a><button v-if="!selectable" class="icon-button more-button" :aria-label="`操作：${node.title}`" aria-haspopup="menu" :aria-expanded="!!menuOpen" title="更多操作" @click="$emit('menu',node,$event)">⋯</button></article></template>
