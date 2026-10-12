<script setup lang="ts">
import Icon from './Icon.vue';
defineEmits<{create:[]}>();
</script>
<template><div class="empty-state"><Icon name="folder"/><h1>留一点空间，给新的发现</h1><p>这个文件夹还没有书签。把常用的网站放在这里。</p><button class="button primary" @click="$emit('create')"><Icon name="plus"/>新建书签</button></div></template>
