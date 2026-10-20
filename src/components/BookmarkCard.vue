<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { domain, faviconColor, type Node } from '../lib/model';
const props = defineProps<{ node: Node; newTab: boolean; menuOpen?: boolean }>();
const tags = defineModel<string[]>('tags', { default: () => [] });
defineEmits<{ menu: [node: Node, event: MouseEvent]; open: [node: Node]; dragstart: [node: Node, event: DragEvent]; dragend: [] }>();
const failed = ref(false);
watch(() => props.node.url, () => failed.value = false);
const host = computed(() => domain(props.node.url));
const colors = computed(() => faviconColor(host.value));
const favicon = computed(() => { try { const url = new URL(chrome.runtime.getURL('/_favicon/'), location.href); url.searchParams.set('pageUrl',props.node.url!); url.searchParams.set('size','32'); return url.href; } catch { return ''; } });
const safeUrl = computed(() => { try { const url = new URL(props.node.url!); return ['http:','https:','ftp:','file:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; } });
</script>
<template><article class="bookmark-card" draggable="true" @dragstart="$emit('dragstart',node,$event)" @dragend="$emit('dragend')"><a class="card-link" :href="safeUrl" :target="newTab ? '_blank' : undefined" rel="noopener noreferrer" :title="node.url" :aria-label="`${node.title || host}${safeUrl ? '' : '（此网址不能从扩展打开）'}`" @click="$emit('open',node)"><span class="favicon" :style="{'--favicon-bg':colors[0],'--favicon-text':colors[1]}"><img v-if="favicon && !failed" :src="favicon" alt="" width="20" height="20" @error="failed = true"><span v-else>{{ host.charAt(0).toUpperCase() || '?' }}</span></span><span class="card-copy"><span class="card-title">{{ node.title || host || '未命名书签' }}</span><span class="card-domain">{{ host || '特殊网址' }}<span v-if="tags.length" class="card-tags" :title="tags.join(' · ')"> · {{ tags.slice(0, 2).join(' · ') }}<span v-if="tags.length > 2"> +{{ tags.length - 2 }}</span></span></span></span></a><button class="icon-button more-button" :aria-label="`操作：${node.title}`" aria-haspopup="menu" :aria-expanded="!!menuOpen" title="更多操作" @click="$emit('menu',node,$event)">⋯</button></article></template>
