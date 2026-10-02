// Pure helpers for the DAW-style transport: beat snapping and ruler ticks.

export interface SnapOptions {
  origin: number
  stepLength: number
  direction: number
  epsilon?: number
}

export function snapAdjacent(time: number, { origin, stepLength, direction, epsilon = 1e-3 }: SnapOptions): number {
  if (!Number.isFinite(stepLength) || stepLength <= 0) return time
  const relative = (time - origin) / stepLength
  const step = direction > 0 ? Math.floor(relative + epsilon) + 1 : Math.ceil(relative - epsilon) - 1
  return origin + step * stepLength
}

const TIME_TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]

export function chooseTimeTickStep(pixelsPerSecond: number, minimumPixels = 70): number {
  for (const step of TIME_TICK_STEPS) {
    if (step * pixelsPerSecond >= minimumPixels) return step
  }
  return TIME_TICK_STEPS[TIME_TICK_STEPS.length - 1]
}

export function formatClockTime(seconds: number, { fractional = false }: { fractional?: boolean } = {}): string {
  const clamped = Math.max(0, seconds)
  const minutes = Math.floor(clamped / 60)
  const wholeSeconds = Math.floor(clamped % 60)
  const base = `${minutes}:${String(wholeSeconds).padStart(2, '0')}`
  if (!fractional) return base
  const tenths = Math.floor((clamped - Math.floor(clamped)) * 10)
  return `${base}.${tenths}`
}

export interface GridRangeOptions {
  viewStart: number
  viewEnd: number
  origin: number
  stepLength: number
}

export function visibleGridRange({ viewStart, viewEnd, origin, stepLength }: GridRangeOptions): { from: number, to: number } {
  if (!Number.isFinite(stepLength) || stepLength <= 0) return { from: 0, to: -1 }
  // `from` may be negative: the grid extends before the origin (bars 0, -1, …).
  const from = Math.floor((viewStart - origin) / stepLength) - 1
  const to = Math.ceil((viewEnd - origin) / stepLength) + 1
  return { from, to }
}
