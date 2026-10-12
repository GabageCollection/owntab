<script setup lang="ts">
import Modal from './Modal.vue';
import ModalActions from './ModalActions.vue';
import RootSwitcher from './RootSwitcher.vue';
import type { Node, Settings } from '../lib/model';
defineProps<{roots:Node[];busy:boolean;error:string}>();
const draft = defineModel<Settings>({required:true});
defineEmits<{submit:[];close:[]}>();
</script>
<template><Modal title="设置" :busy="busy" @close="$emit('close')"><form @submit.prevent="$emit('submit')"><div class="modal-body"><div class="settings-fields"><RootSwitcher v-model="draft.rootId" :roots="roots" :disabled="busy"/><label class="field">主题<select v-model="draft.theme" :disabled="busy"><option value="auto">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label><label class="field">列表密度<select v-model="draft.density" :disabled="busy"><option value="comfortable">舒适</option><option value="compact">紧凑</option></select></label><label><input v-model="draft.openInNewTab" type="checkbox" :disabled="busy"> 在新标签页打开书签</label><p class="muted">书签由 Chrome 管理，仅在本机读取和修改。</p></div><p v-if="error" class="field-error" role="alert">✕ {{ error }}</p></div><ModalActions :busy="busy" @close="$emit('close')"/></form></Modal></template>
