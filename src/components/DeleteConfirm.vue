<script setup lang="ts">
import Modal from './Modal.vue';
import ModalActions from './ModalActions.vue';
import type { Node } from '../lib/model';
defineProps<{node:Node;count:number;busy:boolean;error:string}>();
defineEmits<{submit:[];close:[]}>();
</script>
<template><Modal title="删除确认" :busy="busy" @close="$emit('close')"><form @submit.prevent="$emit('submit')"><div class="modal-body"><p>将删除{{ node.url ? '书签' : '文件夹' }}「<strong>{{ node.title }}</strong>」<template v-if="!node.url">及其中的 {{ count }} 项内容（包括子文件夹）</template>。</p><p class="muted">此操作不可撤销。</p><p v-if="error" class="field-error" role="alert">✕ {{ error }}</p></div><ModalActions :busy="busy" label="确认删除" danger @close="$emit('close')"/></form></Modal></template>
