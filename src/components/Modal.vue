<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import Icon from './Icon.vue';
defineProps<{ title: string; busy?: boolean }>();
const emit = defineEmits<{close:[]}>();
const dialog = ref<HTMLDialogElement>();
// Capture before the dialog/input is inserted: autofocus may run before onMounted.
const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
onMounted(() => { dialog.value?.showModal(); });
onBeforeUnmount(() => { dialog.value?.close(); previous?.focus(); });
</script>
<template><dialog ref="dialog" class="modal" aria-labelledby="modal-title" @cancel.prevent="!busy && emit('close')"><div class="modal-header"><h2 id="modal-title">{{ title }}</h2><button class="icon-button" title="关闭" aria-label="关闭弹窗" :disabled="busy" @click="emit('close')"><Icon name="close"/></button></div><slot/></dialog></template>
