<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NTag } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { fetchAgentStatusSnapshot, type AgentStatusSnapshot } from '@/api/agent-status'
import HermesDataDirectoryHint from '@/components/hermes/HermesDataDirectoryHint.vue'

const { t } = useI18n()
const snapshot = ref<AgentStatusSnapshot | null>(null)
const hermes = computed(() => snapshot.value?.agents.find(agent => agent.id === 'hermes'))
const detected = computed(() => Boolean(hermes.value?.installed))
const sourceType = computed<'CLI' | 'Runtime' | ''>(() => {
  if (hermes.value?.source === 'user-cli') return 'CLI'
  if (hermes.value?.source === 'managed-runtime') return 'Runtime'
  return ''
})
const version = computed(() => {
  const raw = hermes.value?.version?.split('·')[0]?.trim()
  if (!raw) return t('settings.runtime.unknownVersion')
  return /^v(?=\d)/i.test(raw) ? raw : `v${raw}`
})

onMounted(async () => {
  try {
    snapshot.value = await fetchAgentStatusSnapshot()
  } catch {
    snapshot.value = null
  }
})
</script>

<template>
  <section class="hermes-runtime-summary" data-testid="hermes-runtime-summary">
    <div class="summary-row">
      <strong>Hermes</strong>
      <NTag v-if="detected && sourceType" data-testid="hermes-source-type" type="info" size="small" :bordered="false">
        {{ sourceType }}
      </NTag>
      <NTag :type="detected ? 'success' : 'warning'" size="small" :bordered="false">
        {{ detected ? t('settings.runtime.installed') : t('settings.runtime.notInstalled') }}
      </NTag>
      <span v-if="detected" class="summary-version">{{ version }}</span>
    </div>
    <HermesDataDirectoryHint />
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.summary-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.summary-version {
  color: $text-primary;
  font-size: 13px;
  font-weight: 650;
}
</style>
