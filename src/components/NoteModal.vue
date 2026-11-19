<script setup lang="ts">
import Modal from './Modal.vue';
import ModalActions from './ModalActions.vue';
defineProps<{ title: string; busy: boolean; error: string }>();
const note = defineModel<string>({ required: true });
defineEmits<{ close: []; save: [] }>();
</script>
<template>
  <Modal title="书签备注" :busy="busy" @close="$emit('close')">
    <form @submit.prevent="$emit('save')">
      <div class="modal-body">
        <p>{{ title || '未命名书签' }}</p>
        <label class="field">备注<textarea v-model="note" rows="5" maxlength="500" :disabled="busy" autofocus/></label>
        <span class="muted">{{ note.length }} / 500</span>
        <p v-if="error" class="field-error" role="alert">{{ error }}</p>
      </div>
      <ModalActions :busy="busy" @close="$emit('close')"/>
    </form>
  </Modal>
</template>
