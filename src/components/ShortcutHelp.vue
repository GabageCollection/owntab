<script setup lang="ts">
import Modal from './Modal.vue';
defineEmits<{close:[]}>();
</script>
<template>
  <Modal title="键盘快捷键" @close="$emit('close')">
    <div class="modal-body"><dl class="shortcut-list">
      <dt>/ · ⌘/Ctrl+K</dt><dd>打开搜索面板（⌘/Ctrl+K 在搜索输入中也可用）</dd>
      <dt>F6 · Shift+F6</dt><dd>在搜索栏、置顶、根目录与书签区域之间切换</dd>
      <dt>↑ ↓ · Home End</dt><dd>移动区域内焦点；在搜索中选择结果</dd>
      <dt>置顶栏 ← →</dt><dd>移动到前后置顶书签</dd>
      <dt>Alt+Shift+←/→</dt><dd>调整当前置顶顺序</dd>
      <dt>文件夹 → · ←</dt><dd>进入文件夹；返回上级并定位刚离开的文件夹</dd>
      <dt>Enter · 空格</dt><dd>打开焦点链接；空格激活按钮</dd>
      <dt>⌘/Ctrl+Enter</dt><dd>从搜索栏或搜索面板直接网页搜索</dd>
      <dt>Esc</dt><dd>关闭弹窗、菜单并恢复焦点</dd>
      <dt>?</dt><dd>显示此说明</dd>
    </dl><p class="muted">输入文字或中文输入法组词时，单键快捷键不会触发。浏览器保留的快捷键可能由浏览器优先处理。</p></div>
  </Modal>
</template>
