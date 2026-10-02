// Spectrogram palette and onset-focused intensity mapping.
const START = [13, 8, 135]
const MIDDLE = [203, 70, 121]
const END = [240, 249, 33]

export const SPECTROGRAM_DEFAULT_SETTINGS = { cutoff: 0.34, intensity: 9.5, brightness: 100 }

export function onsetIntensity(normalized, cutoff = 0.34, intensityFactor = 9.5) {
  let value = Math.max(normalized, cutoff)
  value = (value - cutoff) * (1 - cutoff)
  value *= value * intensityFactor
  value = Math.max(0, Math.min(1, value))
  return value < 0.2 ? 0 : (Math.tanh(value * 2 - 1) + 1) / 2
}

export function createSpectrogramColorMap(cutoff = 0.34, intensityFactor = 9.5, brightness = 100) {
  const tint = Math.max(0.1, Math.min(100, brightness)) / 100
  return Array.from({ length: 256 }, (_, index) => {
    const progress = onsetIntensity(index / 255, cutoff, intensityFactor)
    const from = progress < 0.5 ? START : MIDDLE
    const to = progress < 0.5 ? MIDDLE : END
    const ratio = progress < 0.5 ? progress * 2 : (progress - 0.5) * 2
    return from.map((channel, channelIndex) => Math.round((channel + (to[channelIndex] - channel) * ratio) * tint))
  })
}

export function normalizeFftSize(value) {
  const size = Number(value)
  return [256, 512, 1024, 2048, 4096, 8192].includes(size) ? size : 1024
}
