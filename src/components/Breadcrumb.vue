<script setup lang="ts">
import { rootLabel, type Node } from '../lib/model';
defineProps<{ path: Node[] }>();
defineEmits<{ navigate: [id: string] }>();
</script>
<template><nav class="breadcrumb" aria-label="文件夹路径"><template v-for="(node,i) in path" :key="node.id"><span v-if="i" aria-hidden="true">›</span><button class="button" :aria-current="i === path.length-1 ? 'page' : undefined" :title="i === 0 ? rootLabel(node) : node.title" @click="$emit('navigate',node.id)">{{ i === 0 ? rootLabel(node) : node.title || '未命名文件夹' }}</button></template></nav></template>
