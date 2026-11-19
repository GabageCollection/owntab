<script setup lang="ts">
import { computed, ref } from 'vue';
import Modal from './Modal.vue';
import ModalActions from './ModalActions.vue';
import RootSwitcher from './RootSwitcher.vue';
import { customEngineSchema, searchEngines, type Node, type Settings } from '../lib/model';
defineProps<{roots:Node[];busy:boolean;error:string}>();
const draft = defineModel<Settings>({required:true});
const emit = defineEmits<{submit:[];close:[];export:[];import:[file:File]}>();
const file = ref<HTMLInputElement>();
const engines = computed(() => searchEngines(draft.value.customEngines));
const editingId = ref<string | null>(null);
const engineName = ref(''), engineTemplate = ref(''), engineError = ref('');
function editEngine(id: string | null) {
  const found = draft.value.customEngines.find(engine => engine.id === id);
  editingId.value = id; engineName.value = found?.name ?? ''; engineTemplate.value = found?.template ?? ''; engineError.value = '';
}
function saveEngine() {
  const parsed = customEngineSchema.safeParse({ id: editingId.value ?? `custom-${crypto.randomUUID()}`, name: engineName.value, template: engineTemplate.value });
  if (!parsed.success) { engineError.value = parsed.error.issues[0].message; return; }
  if (!editingId.value && draft.value.customEngines.length >= 20) { engineError.value = '最多添加 20 个自定义引擎'; return; }
  draft.value.customEngines = editingId.value ? draft.value.customEngines.map(engine => engine.id === editingId.value ? parsed.data : engine) : [...draft.value.customEngines, parsed.data];
  editEngine(null);
}
function removeEngine(id: string) {
  draft.value.customEngines = draft.value.customEngines.filter(engine => engine.id !== id);
  if (draft.value.searchEngine === id) draft.value.searchEngine = 'google';
  if (editingId.value === id) editEngine(null);
}
function picked(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files?.[0]) emit('import', input.files[0]);
  input.value = '';
}
</script>
<template>
  <Modal title="设置" :busy="busy" @close="emit('close')"><form @submit.prevent="emit('submit')">
    <div class="modal-body settings-fields">
      <RootSwitcher v-model="draft.rootId" :roots="roots" :disabled="busy"/>
      <label class="field">主题<select v-model="draft.theme" aria-label="主题" :disabled="busy"><option value="auto">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
      <label class="field">列表密度<select v-model="draft.density" :disabled="busy"><option value="comfortable">舒适</option><option value="compact">紧凑</option></select></label>
      <label class="field">默认视图<select v-model="draft.view" :disabled="busy"><option value="grid">网格</option><option value="list">列表</option></select></label>
      <label><input v-model="draft.openInNewTab" type="checkbox" :disabled="busy"> 在新标签页打开书签</label>
      <label><input v-model="draft.showSearchBar" type="checkbox" :disabled="busy"> 显示搜索栏</label>
      <label class="field">网页搜索引擎<select v-model="draft.searchEngine" aria-label="网页搜索引擎" :disabled="busy"><option v-for="engine in engines" :key="engine.id" :value="engine.id">{{ engine.name }}</option></select></label>
      <fieldset class="engine-editor" :disabled="busy">
        <legend>自定义搜索引擎</legend>
        <div v-for="engine in draft.customEngines" :key="engine.id" class="engine-row"><span>{{ engine.name }}</span><button type="button" class="button" :aria-label="`编辑引擎：${engine.name}`" @click="editEngine(engine.id)">编辑</button><button type="button" class="button" :aria-label="`删除引擎：${engine.name}`" @click="removeEngine(engine.id)">删除</button></div>
        <label class="field">引擎名称<input v-model="engineName" maxlength="40" placeholder="例如：维基百科"></label>
        <label class="field">搜索网址模板<input v-model="engineTemplate" placeholder="https://example.com/search?q={query}" spellcheck="false"></label>
        <p class="muted">用 {query} 表示搜索词，例如 https://zh.wikipedia.org/w/index.php?search={query}。先添加或更新引擎，再保存设置。</p>
        <p v-if="engineError" role="alert" class="field-error">{{ engineError }}</p>
        <div class="settings-io"><button class="button" type="button" @click="saveEngine">{{ editingId ? '更新引擎' : '添加引擎' }}</button><button v-if="editingId" class="button" type="button" @click="editEngine(null)">取消编辑</button></div>
      </fieldset>
      <label><input v-model="draft.showClock" type="checkbox" :disabled="busy"> 显示时钟</label>
      <div class="settings-io"><button class="button" type="button" :disabled="busy" @click="emit('export')">导出本地备份</button><button class="button" type="button" :disabled="busy" @click="file?.click()">导入本地备份</button><input ref="file" class="visually-hidden" type="file" tabindex="-1" accept="application/json,.json" aria-label="选择本地备份" @change="picked"></div>
      <p class="muted">备份已保存的设置、自定义引擎、置顶顺序、最近使用与标签，并包含这些条目引用的网址和文件夹路径以便匹配；不包含完整书签树。书签本身请用 Chrome 导出。导入先预览，支持旧版设置文件。</p>
      <p v-if="error" class="field-error" role="alert">✕ {{ error }}</p>
    </div><ModalActions :busy="busy" @close="emit('close')"/>
  </form></Modal>
</template>
