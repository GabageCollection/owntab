<script setup lang="ts">
import Icon from './Icon.vue';
import type { Node } from '../lib/model';
defineProps<{ node: Node; count: number; menuOpen?: boolean }>();
defineEmits<{ navigate: [id: string]; menu: [node: Node, event: MouseEvent] }>();
</script>
<template><article class="folder-card"><button class="card-link" :aria-label="`进入文件夹：${node.title}`" @click="$emit('navigate',node.id)" @keydown.right.prevent="$emit('navigate',node.id)"><Icon class="folder-icon" name="folder"/><span class="card-copy"><span class="card-title">{{ node.title || '未命名文件夹' }}</span><span class="count">{{ count }} 项</span></span></button><button class="icon-button more-button" :aria-label="`操作：${node.title}`" aria-haspopup="menu" :aria-expanded="!!menuOpen" title="更多操作" @click="$emit('menu',node,$event)">⋯</button></article></template>
