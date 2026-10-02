export const ESSENTIA_CONFIDENCE_MAX = 5.32

export interface ConfidenceLevel {
  key: string
  tone: 'very-low' | 'low' | 'good' | 'excellent'
}

export function classifyEssentiaConfidence(confidence: number): ConfidenceLevel {
  if (confidence < 1) return { key: 'confidenceVeryLow', tone: 'very-low' }
  if (confidence <= 1.5) return { key: 'confidenceLow', tone: 'low' }
  if (confidence <= 3.5) return { key: 'confidenceGood', tone: 'good' }
  return { key: 'confidenceExcellent', tone: 'excellent' }
}
