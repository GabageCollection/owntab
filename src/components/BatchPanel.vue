<script setup lang="ts">
import { computed, ref } from 'vue';
import Modal from './Modal.vue';
import ModalActions from './ModalActions.vue';
import { batchStamp, type BatchResult } from '../lib/batch';
import { descendantCount, findNode, folderChoices, messageError, type Node } from '../lib/model';
import { requestBatch, requestLocal } from '../lib/protocol';

const props = defineProps<{ action: 'move' | 'remove' | 'add' | 'untag'; nodes: Node[]; roots: Node[]; tags: string[]; keeper?: Node }>();
const emit = defineEmits<{ close: []; completed: [result: BatchResult] }>();
const title = { move: '批量移动', remove: props.keeper ? '重复书签清理预览' : '批量删除', add: '批量添加标签', untag: '批量移除标签' }[props.action];
const selected = new Set(props.nodes.map(node => node.id));
function coveredBySelectedAncestor(node: Node) {
  for (let parentId = node.parentId; parentId; ) {
    if (selected.has(parentId)) return true;
    parentId = findNode(props.roots, parentId)?.parentId ?? '';
  }
  return false;
}
const operationNodes = computed(() => props.action === 'remove' ? props.nodes.filter(node => !coveredBySelectedAncestor(node)) : props.nodes);
const destinations = computed(() => {
  const excluded = new Set<string>();
  function visit(nodes: Node[], blocked = false) {
    for (const node of nodes) {
      const blockedHere = blocked || selected.has(node.id);
      if (blockedHere) excluded.add(node.id);
      if (node.children) visit(node.children, blockedHere);
    }
  }
  visit(props.roots);
  return folderChoices(props.roots).filter(({ node }) => !node.unmodifiable && !excluded.has(node.id));
});
const targets = operationNodes.value.map(node => ({ id: node.id, stamp: batchStamp(node, props.action === 'remove'), keepId: props.keeper?.id, keepUrl: props.keeper?.url }));
const names = new Map(props.nodes.map(node => [node.id, node.title || '未命名']));
const destination = ref(''), tag = ref(''), error = ref(''), busy = ref(false);
const result = ref<BatchResult>();
const retryable = computed(() => result.value?.failed.filter(item => item.retryable) ?? []);
const ready = computed(() => props.action === 'move' ? destinations.value.some(({ node }) => node.id === destination.value) : props.action === 'remove' || !!tag.value.trim());
const affected = operationNodes.value.reduce((sum, node) => sum + 1 + descendantCount(node), 0);

function finish() {
  emit('close');
}

async function run() {
  if (busy.value || !ready.value || (result.value && !retryable.value.length)) return;
  busy.value = true;
  error.value = '';
  const previous = result.value;
  const retryIds = new Set(retryable.value.map(item => item.id));
  const pending = previous ? targets.filter(item => retryIds.has(item.id)) : targets;
  try {
    const reply = props.action === 'move' ? await requestBatch({ action: 'move', targets: pending, parentId: destination.value })
      : props.action === 'remove' ? await requestBatch({ action: 'remove', targets: pending })
      : await requestLocal({ action: 'batchTags', ids: pending.map(item => item.id), mode: props.action === 'add' ? 'add' : 'remove', tag: tag.value });
    const newlySucceeded = new Set(reply.succeeded);
    result.value = {
      succeeded: [...new Set([...(previous?.succeeded ?? []), ...reply.succeeded])],
      failed: [...(previous?.failed.filter(item => !item.retryable && !newlySucceeded.has(item.id)) ?? []), ...reply.failed],
    };
    emit('completed', reply);
  } catch (failure) {
    error.value = messageError(failure);
  } finally { busy.value = false; }
}
</script>

<template>
  <Modal :title="title" :busy="busy" @close="emit('close')">
    <form @submit.prevent="run">
      <div class="modal-body">
        <p v-if="keeper">保留：<strong>{{ keeper.title || keeper.url }}</strong></p>
        <template v-if="!result">
          <p v-if="action === 'remove'">将删除 {{ operationNodes.length }} 个独立选中条目<span v-if="affected > operationNodes.length">及其 {{ affected - operationNodes.length }} 个子项</span>。此操作不可撤销。</p>
          <p v-else>已选择 {{ nodes.length }} 项</p>
          <ul class="operation-list">
            <li v-for="node in operationNodes" :key="node.id">{{ node.title || '未命名' }}<span v-if="!node.url" class="muted">（文件夹，共 {{ descendantCount(node) }} 个子项）</span></li>
          </ul>
          <label v-if="action === 'move'" class="field">目标文件夹<select v-model="destination" aria-label="批量移动目标" :disabled="busy"><option disabled value="">选择文件夹</option><option v-for="{ node, depth } in destinations" :key="node.id" :value="node.id">{{ '　'.repeat(depth) }}{{ node.title || '未命名文件夹' }}</option></select></label>
          <label v-if="action === 'add' || action === 'untag'" class="field">标签
            <input v-if="action === 'add'" v-model="tag" maxlength="24" list="batch-tag-options" :disabled="busy" required>
            <select v-else v-model="tag" aria-label="移除的标签" :disabled="busy"><option disabled value="">选择标签</option><option v-for="name in tags" :key="name">{{ name }}</option></select>
          </label>
          <datalist v-if="action === 'add'" id="batch-tag-options"><option v-for="name in tags" :key="name" :value="name"/></datalist>
        </template>
        <template v-else>
          <p role="status">成功 {{ result.succeeded.length }} 项，失败 {{ result.failed.length }} 项</p>
          <details v-if="result.succeeded.length"><summary>查看成功项</summary><ul class="operation-list"><li v-for="id in result.succeeded" :key="id">{{ names.get(id) }}</li></ul></details>
          <ul v-if="result.failed.length" class="operation-list"><li v-for="item in result.failed" :key="item.id"><strong>{{ names.get(item.id) }}</strong>：{{ item.error }}</li></ul>
        </template>
        <p v-if="error" class="field-error" role="alert">{{ error }}</p>
      </div>
      <div v-if="result" class="modal-actions"><button type="button" class="button" :disabled="busy" @click="finish">完成</button><button v-if="retryable.length" type="submit" class="button primary" :disabled="busy || !ready">{{ busy ? '处理中…' : '重试失败项' }}</button></div>
      <ModalActions v-else :busy="busy" :label="action === 'remove' ? '确认删除' : '确认执行'" :danger="action === 'remove'" :disabled="!ready" @close="emit('close')"/>
    </form>
  </Modal>
</template>
