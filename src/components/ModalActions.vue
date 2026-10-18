<script setup lang="ts">
defineProps<{busy:boolean;label?:string;danger?:boolean;disabled?:boolean;hideSubmit?:boolean}>();
defineEmits<{close:[]}>();
</script>
<template><div class="modal-actions"><button class="button" type="button" :disabled="busy" @click="$emit('close')">取消</button><button v-if="!hideSubmit" class="button" :class="danger ? 'danger' : 'primary'" :disabled="busy || disabled" type="submit">{{ busy ? '保存中…' : label || '保存' }}</button></div></template>
