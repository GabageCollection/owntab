<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { Node } from '../lib/model';
defineProps<{ node: Node; x: number; y: number }>();
const emit = defineEmits<{ action: [kind: 'edit'|'move'|'delete', node: Node]; close: [restore: boolean] }>();
const container = ref<HTMLElement>();
onMounted(() => container.value?.querySelector<HTMLButtonElement>('button')?.focus());
function keys(event: KeyboardEvent) {
  const buttons = [...(container.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
  const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
    event.preventDefault();
    buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1 : (i + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length)%buttons.length]?.focus();
  }
  if (event.key === 'Escape') { event.preventDefault(); emit('close',true); }
  // Keep the menu through native Tab traversal, then close without stealing focus.
  if (event.key === 'Tab') setTimeout(() => emit('close',false),0);
}
</script>
<template><div class="menu-backdrop" @click="emit('close',true)" @contextmenu.prevent="emit('close',true)"/><div ref="container" class="context-menu" role="menu" aria-label="书签操作" :style="{left:x+'px',top:y+'px'}" @keydown="keys"><button class="menu-item" role="menuitem" @click="emit('action','edit',node)">编辑</button><button class="menu-item" role="menuitem" @click="emit('action','move',node)">移动</button><button class="menu-item danger" role="menuitem" @click="emit('action','delete',node)">删除</button></div></template>
