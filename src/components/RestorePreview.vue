<script setup lang="ts">
import { computed, ref } from 'vue';
import Modal from './Modal.vue';
import ModalActions from './ModalActions.vue';
import { planRestore, restoreExpectation, type ImportData, type LocalData, type RestoreMode } from '../lib/backup';
import type { Node } from '../lib/model';
const props = defineProps<{ input: ImportData; current: LocalData; tree: Node[]; busy: boolean; error: string }>();
const emit = defineEmits<{ close: []; restore: [mode: RestoreMode, expected: string] }>();
const mode = ref<RestoreMode>('merge');
const plan = computed(() => planRestore(props.input, props.current, props.tree, mode.value));
</script>
<template>
  <Modal title="恢复本地数据" :busy="busy" @close="emit('close')">
    <form @submit.prevent="emit('restore', mode, restoreExpectation(current, plan))">
      <div class="modal-body settings-fields">
        <p>{{ input.kind === 'backup' ? '备份包含设置、自定义引擎、置顶顺序、最近使用和标签。' : '这是旧版设置文件，仅恢复设置与置顶，不改变标签和最近使用。' }}</p>
        <label class="field">恢复方式<select v-model="mode" aria-label="恢复方式" :disabled="busy"><option value="merge">合并本地数据</option><option value="replace">替换本地数据</option></select></label>
        <p class="muted">{{ mode === 'merge' ? '设置采用文件中的值，置顶、标签和最近使用与当前数据合并。' : '设置、置顶及备份中的标签、最近使用将替换当前数据。' }}</p>
        <p role="status">匹配 {{ plan.matched }} 个书签引用，跳过 {{ plan.skipped }} 个未找到或无法唯一匹配的引用。{{ plan.truncatedPins ? `置顶超过 24 个，末尾 ${plan.truncatedPins} 个不会保留。` : '' }}</p>
        <p>恢复后：{{ plan.settings.pinnedIds.length }} 个置顶、{{ Object.keys(plan.tags).length }} 个书签带标签、{{ plan.recent.length }} 条最近使用。</p>
        <p class="muted">不会创建、修改或删除 Chrome 原生书签。自定义引擎随文件设置恢复；可以先导出当前备份再进行替换。</p>
        <p v-if="error" class="field-error" role="alert">✕ {{ error }}</p>
      </div><ModalActions :busy="busy" label="确认恢复" @close="emit('close')"/>
    </form>
  </Modal>
</template>
