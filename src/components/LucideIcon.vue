<script setup vapor lang="ts">
import { computed } from 'vue'
import type { PropType } from 'vue'

const props = defineProps({
  icon: { type: Array as PropType<[string, Record<string, string | number | undefined>][]>, required: true },
  size: { type: [Number, String], default: 24 },
  strokeWidth: { type: [Number, String], default: 2 },
  fill: { type: String, default: 'none' },
})

const allowedTags = new Set(['circle', 'ellipse', 'line', 'path', 'polygon', 'polyline', 'rect'])
const iconBody = computed(() => props.icon
  .filter(([tag]) => allowedTags.has(tag))
  .map(([tag, attributes]) => {
    const serialized = Object.entries(attributes)
      .filter(([, value]) => value !== undefined)
      .map(([name, value]) => `${name}="${String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`)
      .join(' ')
    return `<${tag} ${serialized}></${tag}>`
  })
  .join(''))
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="fill"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="iconBody"
  ></svg>
</template>
