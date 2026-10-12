<script setup lang="ts">
import Modal from './Modal.vue';
import ModalActions from './ModalActions.vue';
import { rootLabel, type Node } from '../lib/model';
defineProps<{node:Node;choices:{node:Node;depth:number}[];busy:boolean;error:string}>();
const destination = defineModel<string>({required:true});
defineEmits<{submit:[];close:[]}>();
</script>
<template><Modal title="移动到文件夹" :busy="busy" @close="$emit('close')"><form @submit.prevent="$emit('submit')"><div class="modal-body"><p class="muted">将「{{ node.title }}」移动到：</p><label class="field">目标文件夹<select v-model="destination" :disabled="busy"><option v-for="choice in choices" :key="choice.node.id" :value="choice.node.id">{{ '　'.repeat(choice.depth) }}{{ choice.depth === 0 ? rootLabel(choice.node) : choice.node.title || '未命名文件夹' }}</option></select></label><p v-if="error" class="field-error" role="alert">✕ {{ error }}</p></div><ModalActions :busy="busy" :disabled="!destination || destination === node.parentId" label="确认移动" @close="$emit('close')"/></form></Modal></template>
