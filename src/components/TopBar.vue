<script setup lang="ts">
import { computed } from 'vue';
import Icon from './Icon.vue';
import type { Settings } from '../lib/model';
const props = defineProps<{ theme: Settings['theme'] }>();
defineEmits<{ theme: []; settings: []; palette: []; recent: [] }>();
const label = computed(() => ({auto:'跟随系统', light:'浅色', dark:'深色'})[props.theme]);
</script>
<template>
  <header class="topbar">
    <span class="brand">owntab<span style="color:var(--accent)">.</span></span>
    <div class="top-actions">
      <slot/>
      <button class="icon-button" title="最近使用" aria-label="最近使用" @click="$emit('recent')"><Icon name="clock"/></button>
      <button class="icon-button" title="搜索书签（/）" aria-label="搜索书签" @click="$emit('palette')"><Icon name="search"/></button>
      <button class="icon-button" :title="`主题：${label}，点击切换`" aria-label="切换主题" @click="$emit('theme')"><Icon :name="theme === 'dark' ? 'sun' : 'moon'"/></button>
      <button class="icon-button" title="设置" aria-label="设置" @click="$emit('settings')"><Icon name="settings"/></button>
    </div>
  </header>
</template>
