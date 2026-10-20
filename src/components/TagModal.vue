<script setup lang="ts">
import { computed } from 'vue';
import Modal from './Modal.vue';
import ModalActions from './ModalActions.vue';
import type { Node, TagMap } from '../lib/model';

const props = defineProps<{ node: Node; tagMap: TagMap; busy: boolean; error: string }>();
const value = defineModel<string>({ required: true });
const emit = defineEmits<{ submit: []; close: [] }>();
const suggestions = computed(() => [...new Set(Object.values(props.tagMap).flat())].sort((a, b) => a.localeCompare(b)));
function add(tag: string) {
  const tags = value.value.split(/[,，]/).map(item => item.trim()).filter(Boolean);
  if (!tags.some(item => item.toLocaleLowerCase() === tag.toLocaleLowerCase())) tags.push(tag);
  value.value = tags.join(', ');
}
</script>

<template>
  <Modal title="编辑标签" :busy="busy" @close="emit('close')">
    <form @submit.prevent="emit('submit')">
      <div class="modal-body">
        <p class="muted">{{ node.title || node.url }}</p>
        <label class="field">标签
          <input v-model="value" :disabled="busy" placeholder="用逗号分隔，例如：工作, 设计" autofocus>
        </label>
        <div v-if="suggestions.length" class="tag-suggestions">
          <button v-for="tag in suggestions" :key="tag" class="tag-chip" type="button" :disabled="busy" @click="add(tag)">+ {{ tag }}</button>
        </div>
        <p class="muted">最多 8 个标签，每个标签最多 24 个字符。标签仅保存在本机。</p>
        <p v-if="error" class="field-error" role="alert">✕ {{ error }}</p>
      </div>
      <ModalActions :busy="busy" @close="emit('close')"/>
    </form>
  </Modal>
</template>
