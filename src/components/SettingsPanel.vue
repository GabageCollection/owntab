<script setup lang="ts">
import { ref } from 'vue';
import Modal from './Modal.vue';
import ModalActions from './ModalActions.vue';
import RootSwitcher from './RootSwitcher.vue';
import { ENGINES, type Node, type Settings } from '../lib/model';
defineProps<{roots:Node[];busy:boolean;error:string}>();
const draft = defineModel<Settings>({required:true});
const emit = defineEmits<{submit:[];close:[];export:[];import:[file:File]}>();
const file = ref<HTMLInputElement>();
function picked(event: Event) {
  const input = event.target as HTMLInputElement;
  const selected = input.files?.[0];
  if (selected) emit('import', selected);
  input.value = '';
}
</script>
<template><Modal title="设置" :busy="busy" @close="$emit('close')"><form @submit.prevent="$emit('submit')"><div class="modal-body"><div class="settings-fields"><RootSwitcher v-model="draft.rootId" :roots="roots" :disabled="busy"/><label class="field">主题<select v-model="draft.theme" :disabled="busy"><option value="auto">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label><label class="field">列表密度<select v-model="draft.density" :disabled="busy"><option value="comfortable">舒适</option><option value="compact">紧凑</option></select></label><label class="field">默认视图<select v-model="draft.view" :disabled="busy"><option value="grid">网格</option><option value="list">列表</option></select></label><label><input v-model="draft.openInNewTab" type="checkbox" :disabled="busy"> 在新标签页打开书签</label><label><input v-model="draft.showSearchBar" type="checkbox" :disabled="busy"> 显示搜索栏</label><label v-if="draft.showSearchBar" class="field">网页搜索引擎<select v-model="draft.searchEngine" :disabled="busy"><option v-for="(label, id) in ENGINES" :key="id" :value="id">{{ label }}</option></select></label><label><input v-model="draft.showClock" type="checkbox" :disabled="busy"> 显示时钟</label><p class="muted">书签由 Chrome 管理，仅在本机读取和修改。</p><div class="settings-io"><button class="button" type="button" :disabled="busy" @click="emit('export')">导出设置</button><button class="button" type="button" :disabled="busy" @click="file?.click()">导入设置</button><input ref="file" class="visually-hidden" type="file" accept="application/json,.json" @change="picked"></div><p class="muted">导入导出仅包含主题、视图、搜索与置顶设置，不包含书签数据。</p></div><p v-if="error" class="field-error" role="alert">✕ {{ error }}</p></div><ModalActions :busy="busy" @close="$emit('close')"/></form></Modal></template>
