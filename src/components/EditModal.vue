<script setup lang="ts">
import Modal from './Modal.vue';
import ModalActions from './ModalActions.vue';
defineProps<{ heading: string; isBookmark: boolean; busy: boolean; error: string }>();
const title = defineModel<string>('title',{required:true});
const url = defineModel<string>('url',{required:true});
defineEmits<{submit:[];close:[]}>();
</script>
<template><Modal :title="heading" :busy="busy" @close="$emit('close')"><form @submit.prevent="$emit('submit')"><div class="modal-body"><label class="field">名称<input v-model="title" autofocus required autocomplete="off" :disabled="busy"></label><label v-if="isBookmark" class="field">网址<input v-model="url" type="url" placeholder="https://example.com" required :disabled="busy"></label><p v-if="error" class="field-error" role="alert">✕ {{ error }}</p></div><ModalActions :busy="busy" @close="$emit('close')"/></form></Modal></template>
