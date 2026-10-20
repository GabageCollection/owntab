<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import BookmarkCard from './components/BookmarkCard.vue';
import Icon from './components/Icon.vue';
import TopBar from './components/TopBar.vue';
import RootTabs from './components/RootTabs.vue';
import Breadcrumb from './components/Breadcrumb.vue';
import FolderCard from './components/FolderCard.vue';
import Skeleton from './components/Skeleton.vue';
import EmptyState from './components/EmptyState.vue';
import StatusBar from './components/StatusBar.vue';
import ContextMenu from './components/ContextMenu.vue';
import EditModal from './components/EditModal.vue';
import DeleteConfirm from './components/DeleteConfirm.vue';
import MoveModal from './components/MoveModal.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import Toast from './components/Toast.vue';
import SearchBar from './components/SearchBar.vue';
import SearchPalette from './components/SearchPalette.vue';
import PinnedBar from './components/PinnedBar.vue';
import ToolbarClock from './components/ToolbarClock.vue';
import MaintenancePanel from './components/MaintenancePanel.vue';
import RecentPanel from './components/RecentPanel.vue';
import TagModal from './components/TagModal.vue';
import { useSettings } from './composables/useSettings';
import { defaultRoot, descendantCount, findNode, flattenBookmarks, folderChoices, messageError, moveIndex, normalizeTags, pinnedSchema, pruneTags, recordRecent, rootsOf, settingsFromExport, settingsToExport, tagsSchema, titleSchema, urlSchema, type Node, type RecentEntry, type Settings, type TagMap } from './lib/model';
import { request, type Changed, type Request } from './lib/protocol';
const props = defineProps<{ initialSettings?: Settings; initialRecent?: RecentEntry[]; initialTags?: TagMap }>();
const {settings,load:loadSettings,save:saveSettings,dispose} = useSettings(props.initialSettings);
const tree = ref<Node[]>([]), items = ref<Node[]>([]), currentId = ref(''), loading = ref(true), syncing = ref(false), importing = ref(false), error = ref('');
const roots = computed(() => rootsOf(tree.value));
const current = computed(() => findNode(tree.value,currentId.value));
const folders = computed(() => items.value.filter(n => !n.url));
const recent = ref<RecentEntry[]>([...(props.initialRecent ?? [])]);
const tagMap = ref<TagMap>({ ...(props.initialTags ?? {}) });
const activeTag = ref('');
const bookmarks = computed(() => items.value.filter(n => n.url && (!activeTag.value || tagMap.value[n.id]?.includes(activeTag.value))));
const allTags = computed(() => [...new Set(Object.values(tagMap.value).flat())].sort((a,b) => a.localeCompare(b)));
const path = computed(() => { const result: Node[] = []; let n = current.value; while(n && n.id !== '0') { result.unshift(n); n = n.parentId ? findNode(tree.value,n.parentId) : undefined; } return result; });
let generation = 0;
const pinnedIds = ref<string[]>([...(props.initialSettings?.pinnedIds ?? [])]);
const pinnedNodes = computed(() => pinnedIds.value.map(id => findNode(tree.value, id)).filter((n): n is Node => !!n?.url));
async function savePinned(ids: string[]) { try { const clean = pinnedSchema.parse(ids); pinnedIds.value = clean; const next = {...settings.value, pinnedIds: clean}; await saveSettings(next); } catch(e) { notify(messageError(e), 'error'); } }
function togglePin(node: Node) { if (!node.url) return; savePinned(pinnedIds.value.includes(node.id) ? pinnedIds.value.filter(id => id !== node.id) : [...pinnedIds.value, node.id]); }
function unpin(id: string) { savePinned(pinnedIds.value.filter(saved => saved !== id)); }
function persistAux(key: 'recent' | 'tags', value: unknown) { void chrome.storage.local.set({ [key]: value }).catch(e => notify(messageError(e), 'error')); }
function recordOpened(node: Node) { if (!node.url) return; recent.value = recordRecent(recent.value, node.id); persistAux('recent', recent.value); }
function launchBookmark(node: Node) {
 const safe = (() => { try { const parsed = new URL(node.url!); return ['http:','https:','ftp:','file:'].includes(parsed.protocol) ? parsed.href : undefined; } catch { return undefined; } })();
 if (!safe) { notify('此网址不能从扩展打开', 'error'); return; }
 recordOpened(node);
 if (settings.value.openInNewTab) window.open(safe, '_blank', 'noopener,noreferrer');
 else location.href = safe;
}
function pruneLocalData(fresh: Node[]) {
 const ids = new Set(flattenBookmarks(fresh).map(node => node.id));
 const nextRecent = recent.value.filter(entry => ids.has(entry.id));
 if (nextRecent.length !== recent.value.length) { recent.value = nextRecent; persistAux('recent', nextRecent); }
 const nextTags = pruneTags(tagMap.value, fresh);
 if (Object.keys(nextTags).length !== Object.keys(tagMap.value).length) { tagMap.value = nextTags; persistAux('tags', nextTags); }
 if (activeTag.value && !Object.values(nextTags).flat().includes(activeTag.value)) activeTag.value = '';
}
async function refresh(id = currentId.value, initial = false) {
 const ticket = ++generation; if(initial) loading.value = true; syncing.value = true;
 try {
  const fresh = await request({scope:'owntab',action:'tree'}) as Node[];
  const root = defaultRoot(rootsOf(fresh),settings.value.rootId);
  if (!root) throw new Error('未找到可用的书签根目录');
  let target = findNode(fresh,id);
  if (!target || target.url || target.id === '0') target = root;
  const children = await request({scope:'owntab',action:'children',id:target.id}) as Node[];
  if(ticket !== generation) return;
  tree.value = fresh; currentId.value = target.id; items.value = children; error.value = ''; pruneLocalData(fresh);
 } catch(e) { if(ticket === generation) error.value = messageError(e); }
 finally { if(ticket === generation) { loading.value = false; syncing.value = false; } }
}
function navigate(id: string) { closeMenu(); void refresh(id); }
function changed(message: Changed) { if(message?.scope !== 'owntab-changed') return; importing.value = !!message.importing; if(importing.value) return; if(message.all || message.parentIds.includes(currentId.value) || message.parentIds.some(id => path.value.some(n => n.id === id))) void refresh(); }
const toast = ref<{message:string;kind:'success'|'error'} | null>(null); let toastTimer: ReturnType<typeof setTimeout>;
function notify(message: string, kind: 'success'|'error' = 'success') { toast.value = {message,kind}; clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.value = null,3000); }
const menu = ref<{node:Node;x:number;y:number} | null>(null); let menuTrigger: HTMLElement | null = null;
function openMenu(node: Node,event: MouseEvent) { menuTrigger = event.currentTarget as HTMLElement; const r = menuTrigger.getBoundingClientRect(); menu.value = {node,x:Math.max(8,Math.min(r.right-160,innerWidth-168)),y:Math.max(8,Math.min(r.bottom+4,innerHeight-140))}; }
function closeMenu(restore = false) {
 const wasOpen = menu.value !== null;
 menu.value = null;
 if(restore && wasOpen) menuTrigger?.focus();
 menuTrigger = null;
}
const modal = ref<'edit'|'delete'|'move'|'settings'|'palette'|'maintenance'|'recent'|'tags'|null>(null), selected = ref<Node>(), creatingFolder = ref(false), title = ref(''), url = ref(''), destination = ref(''), busy = ref(false), formError = ref('');
const draft = ref<Settings>({...settings.value});
const paletteInitial = ref('');
const tagDraft = ref('');
function begin(kind: 'edit'|'delete'|'move',node?:Node,folder = false) { selected.value = node; creatingFolder.value = folder; title.value = node?.title ?? ''; url.value = node?.url ?? ''; destination.value = node?.parentId ?? currentId.value; formError.value = ''; closeMenu(true); modal.value = kind; }
function openSettings() { draft.value = {...settings.value}; formError.value = ''; modal.value = 'settings'; }
function openPalette(query = '') { paletteInitial.value = query; modal.value = 'palette'; }
function openRecent() { modal.value = 'recent'; }
function editTags(node: Node) { selected.value = node; tagDraft.value = (tagMap.value[node.id] ?? []).join(', '); formError.value = ''; modal.value = 'tags'; }
async function saveTags() {
 if (!selected.value || busy.value) return;
 busy.value = true; formError.value = '';
 try {
  const tags = normalizeTags(tagDraft.value);
  const next = { ...tagMap.value };
  if (tags.length) next[selected.value.id] = tags; else delete next[selected.value.id];
  tagsSchema.parse(next);
  await chrome.storage.local.set({ tags: next });
  tagMap.value = next;
  modal.value = null;
  notify('标签已保存');
 } catch(e) { formError.value = messageError(e); }
 finally { busy.value = false; }
}
function exportSettings() {
 const blob = new Blob([settingsToExport(settings.value)], { type: 'application/json' });
 const url = URL.createObjectURL(blob);
 const anchor = document.createElement('a');
 anchor.href = url; anchor.download = 'owntab-settings.json'; anchor.click();
 setTimeout(() => URL.revokeObjectURL(url), 0);
 notify('设置已导出');
}
async function importSettings(file: File) {
 if (busy.value) return;
 busy.value = true; formError.value = '';
 try {
  const imported = settingsFromExport(await file.text());
  await saveSettings(imported);
  draft.value = { ...imported };
  modal.value = null;
  notify('设置已导入');
 } catch(e) { formError.value = messageError(e); }
 finally { busy.value = false; }
}
const choices = computed(() => folderChoices(roots.value,modal.value === 'move' ? selected.value?.id : undefined));
const deleting = computed(() => selected.value ? findNode(tree.value,selected.value.id) ?? selected.value : undefined);
const modalTitle = computed(() => modal.value === 'settings' ? '设置' : modal.value === 'move' ? '移动到文件夹' : modal.value === 'delete' ? '删除确认' : selected.value ? '编辑' + (selected.value.url ? '书签' : '文件夹') : '新建' + (creatingFolder.value ? '文件夹' : '书签'));
/* Drag & drop reordering / moving. */
const dragNode = ref<Node | null>(null);
const dropIndicator = ref<{ id: string; position: 'before' | 'after' | 'into' } | null>(null);
function startDrag(node: Node, event: DragEvent) {
  if (!event.dataTransfer || node.unmodifiable) return;
  closeMenu();
  dragNode.value = node;
  event.dataTransfer.setData('application/x-owntab-node', node.id);
  event.dataTransfer.effectAllowed = 'move';
}
function endDrag() { dragNode.value = null; dropIndicator.value = null; }
function bookmarkDragOver(node: Node, event: DragEvent) {
  const source = dragNode.value;
  if (!source || !event.dataTransfer || source.id === node.id || source.parentId !== currentId.value) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  dropIndicator.value = { id: node.id, position: event.clientX < rect.left + rect.width / 2 ? 'before' : 'after' };
}
async function bookmarkDrop(node: Node, event: DragEvent) {
  const source = dragNode.value;
  const indicator = dropIndicator.value;
  event.preventDefault();
  endDrag();
  if (!source || source.id === node.id || source.parentId !== node.parentId || !indicator) return;
  if (indicator.position === 'into') return;
  const siblings = findNode(tree.value, node.parentId ?? '')?.children ?? [];
  const index = moveIndex(siblings, source.id, node.id, indicator.position);
  if (index < 0) return;
  try { await request({scope:'owntab',action:'move',id:source.id,parentId:node.parentId!,index}); notify('已调整顺序'); }
  catch(e) { notify(messageError(e),'error'); }
}
function folderDragOver(folderNode: Node, event: DragEvent) {
  const source = dragNode.value;
  if (!source || source.id === folderNode.id || source.parentId === folderNode.id) return;
  if (findNode([source], folderNode.id)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  let position: 'before' | 'after' | 'into' = 'into';
  if (!source.url && source.parentId === folderNode.parentId) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (event.clientX < rect.left + rect.width / 3) position = 'before';
    else if (event.clientX > rect.right - rect.width / 3) position = 'after';
  }
  dropIndicator.value = { id: folderNode.id, position };
}
async function folderDrop(folderNode: Node, event: DragEvent) {
  const source = dragNode.value;
  const indicator = dropIndicator.value;
  event.preventDefault();
  endDrag();
  if (!source || source.id === folderNode.id || source.parentId === folderNode.id) return;
  if (findNode([source], folderNode.id)) { notify('不能移动到自身或子文件夹中','error'); return; }
  try {
    if (indicator?.position === 'before' || indicator?.position === 'after') {
      const siblings = findNode(tree.value, folderNode.parentId ?? '')?.children ?? [];
      const index = moveIndex(siblings, source.id, folderNode.id, indicator.position);
      if (index < 0) return;
      await request({scope:'owntab',action:'move',id:source.id,parentId:folderNode.parentId!,index});
      notify('已调整顺序');
    } else {
      await request({scope:'owntab',action:'move',id:source.id,parentId:folderNode.id});
      notify('已移动到「' + (folderNode.title || '文件夹') + '」');
    }
  }
  catch(e) { notify(messageError(e),'error'); }
}
async function maintenanceRemove(node: Node) {
  try { await request({scope:'owntab',action:'remove',id:node.id}); notify('已删除'); }
  catch(e) { notify(messageError(e),'error'); }
}
async function toggleView() {
  const view = settings.value.view === 'grid' ? 'list' : 'grid';
  try { await saveSettings({...settings.value, view}); notify(view === 'grid' ? '网格视图' : '列表视图'); }
  catch(e) { notify(messageError(e),'error'); }
}
async function submit() {
 if(busy.value) return; formError.value = ''; busy.value = true;
 try {
  if(modal.value === 'settings') { await saveSettings(draft.value); notify('设置已保存'); }
  else {
   let command: Request;
   if(modal.value === 'delete') command = {scope:'owntab',action:'remove',id:selected.value!.id};
   else if(modal.value === 'move') command = {scope:'owntab',action:'move',id:selected.value!.id,parentId:destination.value};
   else { const cleanTitle = titleSchema.parse(title.value); const isBookmark = selected.value ? !!selected.value.url : !creatingFolder.value; const cleanUrl = isBookmark ? urlSchema.parse(url.value) : undefined;
    command = selected.value ? {scope:'owntab',action:'update',id:selected.value.id,title:cleanTitle,url:cleanUrl} : {scope:'owntab',action:'create',parentId:currentId.value,title:cleanTitle,url:cleanUrl}; }
   await request(command); notify(modal.value === 'delete' ? '已删除' : modal.value === 'move' ? '已移动' : '已保存');
  }
  modal.value = null;
 } catch(e) { formError.value = messageError(e); } finally { busy.value = false; }
}
async function cycleTheme() { const next = settings.value.theme === 'auto' ? 'light' : settings.value.theme === 'light' ? 'dark' : 'auto'; try { await saveSettings({...settings.value,theme:next}); notify('主题：' + ({auto:'跟随系统',light:'浅色',dark:'深色'})[next]); } catch(e) { notify(messageError(e),'error'); } }
function pageKeys(event: KeyboardEvent) {
 if ((event.key === '/' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) && !modal.value && !menu.value && !(event.target as HTMLElement)?.closest('input,select,textarea')) { event.preventDefault(); openPalette(); return; }
 if(modal.value || menu.value || (event.target as HTMLElement)?.closest('input,select,textarea')) return; if(event.key === 'ArrowLeft' && path.value.length > 1) { event.preventDefault(); navigate(path.value[path.value.length-2].id); } if(event.key === 'ArrowDown' || event.key === 'ArrowUp') { const links = [...document.querySelectorAll<HTMLElement>('.grid .card-link')]; const i = links.indexOf(document.activeElement as HTMLElement); if(i >= 0) { event.preventDefault(); links[(i+(event.key === 'ArrowDown' ? 1 : -1)+links.length)%links.length]?.focus(); } } }
onMounted(async () => { chrome.runtime.onMessage.addListener(changed); document.addEventListener('keydown',pageKeys); try { if (!props.initialSettings) await loadSettings(); await refresh(settings.value.rootId,true); } catch(e) { error.value = messageError(e); loading.value = false; } });
onBeforeUnmount(() => { ++generation; dispose(); chrome.runtime.onMessage.removeListener(changed); document.removeEventListener('keydown',pageKeys); clearTimeout(toastTimer); });
</script>
<template>
  <div class="app-shell" :class="{compact:settings.density === 'compact'}">
    <TopBar :theme="settings.theme" @theme="cycleTheme" @settings="openSettings" @palette="openPalette()" @recent="openRecent">
      <ToolbarClock v-if="settings.showClock"/>
    </TopBar>
    <main>
      <SearchBar v-if="settings.showSearchBar" :engine-id="settings.searchEngine" :new-tab="settings.openInNewTab" @palette="openPalette"/>
      <PinnedBar v-if="pinnedNodes.length" :nodes="pinnedNodes" :new-tab="settings.openInNewTab" @unpin="unpin" @open="recordOpened"/>
      <RootTabs :roots="roots" :active-id="path[0]?.id" @navigate="navigate"/>
      <div class="content-toolbar">
        <Breadcrumb v-if="path.length > 1" :path="path" @navigate="navigate"/>
        <div class="toolbar-actions">
          <select v-if="allTags.length" v-model="activeTag" class="tag-filter" aria-label="按标签筛选">
            <option value="">全部标签</option>
            <option v-for="tag in allTags" :key="tag" :value="tag">{{ tag }}</option>
          </select>
          <button class="icon-button" :aria-pressed="settings.view === 'list'" :title="settings.view === 'grid' ? '切换为列表视图' : '切换为网格视图'" :aria-label="settings.view === 'grid' ? '切换为列表视图' : '切换为网格视图'" @click="toggleView"><Icon :name="settings.view === 'grid' ? 'list' : 'grid'"/></button>
          <button class="icon-button" title="书签维护（重复/失效链接）" aria-label="书签维护" @click="modal = 'maintenance'"><Icon name="wrench"/></button>
          <button class="button" :disabled="!current || loading" @click="begin('edit',undefined,true)"><Icon name="folder"/>新建文件夹</button>
          <button class="button primary" :disabled="!current || loading" @click="begin('edit')"><Icon name="plus"/>新建书签</button>
        </div>
      </div>
      <div v-if="error" class="error-panel" role="alert"><span>✕ {{ error }}</span><button class="button" @click="refresh(currentId,true)">重试</button></div>
      <Skeleton v-if="loading"/>
      <template v-else>
        <div v-if="folders.length" class="grid folder-grid" :class="{'list-view': settings.view === 'list'}">
          <FolderCard v-for="node in folders" :key="node.id" :node="node" :count="findNode(tree,node.id)?.children?.length ?? 0" :menu-open="menu?.node.id === node.id" :drop-position="dropIndicator?.id === node.id ? dropIndicator.position : null" :class="{dragging: dragNode?.id === node.id}" @navigate="navigate" @menu="openMenu" @dragstart="startDrag" @dragend="endDrag" @dragover="folderDragOver" @drop="folderDrop"/>
        </div>
        <div v-if="bookmarks.length" class="grid" :class="{'list-view': settings.view === 'list'}">
          <BookmarkCard v-for="node in bookmarks" :key="node.id" :node="node" :tags="tagMap[node.id] ?? []" :new-tab="settings.openInNewTab" :menu-open="menu?.node.id === node.id" :class="{dragging: dragNode?.id === node.id, 'drag-before': dropIndicator?.id === node.id && dropIndicator.position === 'before', 'drag-after': dropIndicator?.id === node.id && dropIndicator.position === 'after'}" @menu="openMenu" @open="recordOpened" @dragstart="startDrag" @dragend="endDrag" @dragover="bookmarkDragOver(node,$event)" @drop="bookmarkDrop(node,$event)"/>
        </div>
        <EmptyState v-if="!items.length && !error" @create="begin('edit')"/>
        <div v-else-if="!folders.length && !bookmarks.length && !error" class="empty-state"><p>当前标签下没有书签。</p><button class="button" @click="activeTag = ''">清除筛选</button></div>
      </template>
      <StatusBar :count="items.length" :folders="folders.length" :error="!!error" :importing="importing" :syncing="syncing || loading"/>
    </main>
  </div>
  <ContextMenu v-if="menu" :node="menu.node" :x="menu.x" :y="menu.y" :pinned="pinnedIds.includes(menu.node.id)" @action="begin" @close="closeMenu" @pin="togglePin" @tags="editTags"/>
  <EditModal v-if="modal === 'edit'" v-model:title="title" v-model:url="url" :heading="modalTitle" :is-bookmark="selected ? !!selected.url : !creatingFolder" :busy="busy" :error="formError" @submit="submit" @close="modal = null"/>
  <DeleteConfirm v-if="modal === 'delete' && selected" :node="selected" :count="deleting ? descendantCount(deleting) : 0" :busy="busy" :error="formError" @submit="submit" @close="modal = null"/>
  <MoveModal v-if="modal === 'move' && selected" v-model="destination" :node="selected" :choices="choices" :busy="busy" :error="formError" @submit="submit" @close="modal = null"/>
  <SettingsPanel v-if="modal === 'settings'" v-model="draft" :roots="roots" :busy="busy" :error="formError" @submit="submit" @export="exportSettings" @import="importSettings" @close="modal = null"/>
  <SearchPalette v-if="modal === 'palette'" :tree="tree" :pinned-ids="pinnedIds" :tags="tagMap" :engine-id="settings.searchEngine" :new-tab="settings.openInNewTab" :initial-query="paletteInitial" @close="modal = null" @navigate="navigate" @open="launchBookmark"/>
  <RecentPanel v-if="modal === 'recent'" :tree="tree" :entries="recent" :new-tab="settings.openInNewTab" @close="modal = null" @navigate="navigate" @open="launchBookmark"/>
  <TagModal v-if="modal === 'tags' && selected" v-model="tagDraft" :node="selected" :tag-map="tagMap" :busy="busy" :error="formError" @submit="saveTags" @close="modal = null"/>
  <MaintenancePanel v-if="modal === 'maintenance'" :tree="tree" :busy="busy" :error="formError" @remove="maintenanceRemove" @navigate="navigate" @close="modal = null"/>
  <Toast v-if="toast" :message="toast.message" :kind="toast.kind"/>
</template>
