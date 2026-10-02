import { computed, ref } from 'vue'

export const signatures = [
  { id: '4-4', numerator: 4, denominator: 4, label: '4/4' },
  { id: '3-4', numerator: 3, denominator: 4, label: '3/4' },
  { id: '6-8', numerator: 6, denominator: 8, label: '6/8' },
  { id: '5-4', numerator: 5, denominator: 4, label: '5/4' },
]

export function useTimeSignature() {
  const selectedSignatureId = ref('4-4')
  const customNumerator = ref(7)
  const customDenominator = ref(8)

  const activeSignature = computed(() => {
    if (selectedSignatureId.value === 'custom') {
      const numerator = Math.max(1, Math.min(16, Number(customNumerator.value) || 1))
      const denominator = Number(customDenominator.value) || 4
      return { id: 'custom', numerator, denominator, label: `${numerator}/${denominator}` }
    }
    return signatures.find(({ id }) => id === selectedSignatureId.value) || signatures[0]
  })

  function selectSignature(id) {
    selectedSignatureId.value = id
  }

  function activateCustomSignature() {
    customNumerator.value = Math.max(1, Math.min(16, Number(customNumerator.value) || 1))
    selectSignature('custom')
  }

  return {
    signatures,
    selectedSignatureId,
    customNumerator,
    customDenominator,
    activeSignature,
    selectSignature,
    activateCustomSignature,
  }
}
