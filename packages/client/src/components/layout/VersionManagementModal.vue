<script setup lang="ts">
import { NDrawer, NDrawerContent } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import RuntimeSettings from '@/components/hermes/settings/RuntimeSettings.vue'

defineProps<{ show: boolean }>()
const emit = defineEmits<{ (event: 'update:show', value: boolean): void }>()

const { t } = useI18n()
</script>

<template>
  <NDrawer
    :show="show"
    placement="right"
    :width="'min(860px, calc(100vw - 24px))'"
    @update:show="emit('update:show', $event)"
  >
    <NDrawerContent :title="t('runtimeVersions.title')" closable>
      <RuntimeSettings />
    </NDrawerContent>
  </NDrawer>
</template>
