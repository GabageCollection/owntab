<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import { searchEngineName, searchUrl, type CustomEngine } from '../lib/model';

const props = defineProps<{ engineId: string; newTab: boolean; customEngines: CustomEngine[] }>();
const emit = defineEmits<{ palette: [query: string]; search: [query: string] }>();
const query = ref('');
const engineName = computed(() => searchEngineName(props.engineId, props.customEngines));
function submit() {
  const value = query.value.trim();
  if (!value) { emit('palette', ''); return; }
  emit('palette', value);
}
function directSearch() {
  const value = query.value.trim();
  if (!value) return;
  const url = searchUrl(value, props.engineId, props.customEngines);
  if (props.newTab) window.open(url, '_blank', 'noopener,noreferrer');
  else location.href = url;
}
function keys(event: KeyboardEvent) {
  if (!event.isComposing && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault(); directSearch();
  }
}
</script>

<template>
  <form class="search-bar" role="search" @submit.prevent="submit">
    <Icon name="search"/>
    <input v-model="query" type="search" :placeholder="`搜索书签或网页（${engineName}），按 / 打开搜索面板`" aria-label="搜索书签或网页" spellcheck="false" @keydown="keys">
    <button v-if="query.trim()" type="button" class="button" @click="directSearch">用 {{ engineName }} 搜索</button>
    <button type="submit" class="button primary" :disabled="!query.trim()">查找</button>
  </form>
</template>
