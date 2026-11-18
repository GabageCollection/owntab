<script lang="ts">
const modalOrigins = new WeakMap<HTMLDialogElement, HTMLElement | null>();
</script>
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import Icon from './Icon.vue';
defineProps<{ title: string; busy?: boolean }>();
const emit = defineEmits<{close:[]}>();
const dialog = ref<HTMLDialogElement>();
// Capture before the dialog/input is inserted: autofocus may run before onMounted.
const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
const owner = focused?.closest('dialog');
const previous = owner instanceof HTMLDialogElement ? modalOrigins.get(owner) ?? null : focused;
onMounted(() => { if (dialog.value) { modalOrigins.set(dialog.value, previous); dialog.value.showModal(); } });
onBeforeUnmount(() => { if (dialog.value) modalOrigins.delete(dialog.value); dialog.value?.close(); previous?.focus(); });
</script>
<template><dialog ref="dialog" class="modal" aria-labelledby="modal-title" @cancel.prevent="!busy && emit('close')"><div class="modal-header"><h2 id="modal-title">{{ title }}</h2><button class="icon-button" title="关闭" aria-label="关闭弹窗" :disabled="busy" @click="emit('close')"><Icon name="close"/></button></div><slot/></dialog></template>
