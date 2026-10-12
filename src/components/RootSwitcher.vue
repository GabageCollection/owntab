<script setup lang="ts">
import { rootLabel, type Node } from '../lib/model';
defineProps<{roots:Node[];disabled?:boolean}>();
const rootId = defineModel<string>({required:true});
</script>
<template><label class="field">默认根目录<select v-model="rootId" :disabled="disabled"><option v-for="root in roots" :key="root.id" :value="root.id">{{ rootLabel(root) }}</option></select></label></template>
