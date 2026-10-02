const SCALE_FORWARD = {
  linear: (frequency) => frequency,
  mel: (frequency) => 2595 * Math.log10(1 + frequency / 700),
  erb: (frequency) => 21.4 * Math.log10(1 + 0.00437 * frequency),
}

const SCALE_INVERSE = {
  linear: (value) => value,
  mel: (value) => 700 * (10 ** (value / 2595) - 1),
  erb: (value) => (10 ** (value / 21.4) - 1) / 0.00437,
}

function normalizeScale(scale) {
  return SCALE_FORWARD[scale] ? scale : 'linear'
}

export function frequencyToPosition(frequency, { scale = 'linear', minFrequency = 0, maxFrequency = 20000 } = {}) {
  const forward = SCALE_FORWARD[normalizeScale(scale)]
  const low = forward(Math.max(0, minFrequency))
  const high = forward(Math.max(minFrequency + 1, maxFrequency))
  return Math.max(0, Math.min(1, (forward(Math.max(0, frequency)) - low) / (high - low)))
}

export function positionToFrequency(position, { scale = 'linear', minFrequency = 0, maxFrequency = 20000 } = {}) {
  const key = normalizeScale(scale)
  const forward = SCALE_FORWARD[key]
  const low = forward(Math.max(0, minFrequency))
  const high = forward(Math.max(minFrequency + 1, maxFrequency))
  return SCALE_INVERSE[key](low + Math.max(0, Math.min(1, position)) * (high - low))
}

export function formatFrequency(frequency) {
  if (frequency >= 1000) {
    const kilohertz = frequency / 1000
    return `${Number.isInteger(kilohertz) ? kilohertz : kilohertz.toFixed(1)}k`
  }
  return String(Math.round(frequency))
}

const TICK_CANDIDATES = [20, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 16000, 20000]

export function buildFrequencyTicks({ scale = 'linear', minFrequency = 0, maxFrequency = 20000, maxTicks = 8 } = {}) {
  const options = { scale, minFrequency, maxFrequency }
  const minimumGap = 1 / Math.max(1, maxTicks)
  const ticks = []
  let lastPosition = -Infinity
  for (const frequency of TICK_CANDIDATES) {
    if (frequency < minFrequency || frequency > maxFrequency) continue
    const position = frequencyToPosition(frequency, options)
    if (position - lastPosition < minimumGap * 0.9 || position > 0.98) continue
    lastPosition = position
    ticks.push({ frequency, position, label: formatFrequency(frequency) })
  }
  return ticks
}
