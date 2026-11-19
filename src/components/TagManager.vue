<script setup lang="ts">
import { ref } from 'vue';
import Modal from './Modal.vue';
import ModalActions from './ModalActions.vue';
import { messageError } from '../lib/model';
import { requestLocal } from '../lib/protocol';

const props = defineProps<{ tags: { name: string; count: number }[] }>();
const emit = defineEmits<{ close: []; changed: [source: string, next: string] }>();
const edit = ref<{ name: string; count: number; mode: 'rename' | 'merge' | 'remove' }>();
const target = ref(''), error = ref(''), busy = ref(false);
const alternatives = () => props.tags.filter(item => item.name !== edit.value?.name);
function begin(item: { name: string; count: number }, mode: 'rename' | 'merge' | 'remove') {
  edit.value = { ...item, mode };
  target.value = mode === 'rename' ? item.name : '';
  error.value = '';
}
async function submit() {
  const current = edit.value;
  if (!current || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await requestLocal({ action: 'manageTag', mode: current.mode, source: current.name, target: current.mode === 'remove' ? undefined : target.value });
    emit('changed', current.name, current.mode === 'remove' ? '' : target.value.trim());
    edit.value = undefined;
  } catch (failure) { error.value = messageError(failure); }
  finally { busy.value = false; }
}
</script>
<template>
  <Modal title="管理标签" :busy="busy" @close="emit('close')">
    <form @submit.prevent="submit">
      <div class="modal-body">
        <template v-if="!edit">
          <p v-if="!tags.length" class="muted">暂无标签</p>
          <div v-for="item in tags" :key="item.name" class="tag-manager-row">
            <span><strong>{{ item.name }}</strong> <span class="muted">{{ item.count }} 个书签</span></span>
            <div class="operation-actions">
              <button type="button" class="button" :aria-label="`重命名 ${item.name}`" @click="begin(item, 'rename')">重命名</button>
              <button type="button" class="button" :aria-label="`合并 ${item.name}`" :disabled="tags.length < 2" @click="begin(item, 'merge')">合并</button>
              <button type="button" class="button danger" :aria-label="`删除标签 ${item.name}`" @click="begin(item, 'remove')">删除</button>
            </div>
          </div>
        </template>
        <template v-else>
          <p>{{ edit.mode === 'remove' ? '将移除标签' : '正在编辑标签' }}「{{ edit.name }}」，关联 {{ edit.count }} 个书签。</p>
          <label v-if="edit.mode === 'rename'" class="field">新名称<input v-model="target" maxlength="24" required :disabled="busy"></label>
          <label v-if="edit.mode === 'merge'" class="field">合并到<select v-model="target" aria-label="合并到" required :disabled="busy"><option disabled value="">选择已有标签</option><option v-for="item in alternatives()" :key="item.name">{{ item.name }}</option></select></label>
          <p v-if="error" class="field-error" role="alert">{{ error }}</p>
        </template>
      </div>
      <ModalActions v-if="edit" :busy="busy" :label="edit.mode === 'remove' ? '确认移除标签' : '确认保存'" :danger="edit.mode === 'remove'" @close="edit = undefined"/>
      <div v-else class="modal-actions"><button type="button" class="button" @click="emit('close')">完成</button></div>
    </form>
  </Modal>
</template>
