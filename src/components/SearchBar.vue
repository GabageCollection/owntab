<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import { ENGINES, engine, searchUrl } from '../lib/model';

const props = defineProps<{ engineId: string; newTab: boolean }>();
const emit = defineEmits<{ palette: [] }>();
const query = ref('');
const engineName = computed(() => ENGINES[engine(props.engineId)]);
function submit() {
  const value = query.value.trim();
  if (!value) { emit('palette'); return; }
  const url = searchUrl(value, props.engineId);
  if (props.newTab) window.open(url, '_blank', 'noopener,noreferrer');
  else location.href = url;
}
</script>

<template>
  <form class="search-bar" role="search" @submit.prevent="submit">
    <Icon name="search"/>
    <input v-model="query" type="search" :placeholder="`搜索书签或网页（${engineName}），按 / 聚焦`" aria-label="搜索书签或网页" spellcheck="false">
    <button v-if="query.trim()" type="button" class="button" @click="emit('palette')">在书签中查找</button>
    <button type="submit" class="button primary" :disabled="!query.trim()">{{ engineName }}</button>
  </form>
</template>
