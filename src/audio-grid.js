export function secondsPerMeterBeat(bpm, denominator) {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError('BPM must be positive')
  if (![2, 4, 8, 16].includes(denominator)) throw new RangeError('Unsupported denominator')
  return 60 / bpm
}

export function generateBeatGrid({ duration, bpm, origin, numerator, denominator }) {
  if (!Number.isFinite(duration) || duration <= 0) return []
  const beatDuration = secondsPerMeterBeat(bpm, denominator)
  const beats = []
  // Start at the first beat with time >= 0, which lies before the origin when
  // the origin sits inside the track (bars 0, -1, ... extend backwards).
  let beatIndex = Math.ceil((0 - origin) / beatDuration - 1e-9)
  let time = origin + beatIndex * beatDuration

  while (time <= duration) {
    const beatInBar = ((beatIndex % numerator) + numerator) % numerator
    beats.push({
      time: Math.max(0, time),
      beat: beatInBar,
      bar: Math.floor(beatIndex / numerator) + 1,
      isBar: beatInBar === 0,
    })
    beatIndex += 1
    time = origin + beatIndex * beatDuration
  }
  return beats
}

export function findNextBeatIndex(grid, currentTime, tolerance = 0.02) {
  const index = grid.findIndex(({ time }) => time >= currentTime - tolerance)
  return index < 0 ? grid.length : index
}

export function collectScheduledBeats({ grid, startIndex, currentTime, playbackRate, aheadTime = 0.1 }) {
  const events = []
  const horizon = currentTime + aheadTime * playbackRate
  let nextIndex = startIndex
  while (nextIndex < grid.length && grid[nextIndex].time <= horizon) {
    const beat = grid[nextIndex]
    if (beat.time >= currentTime - 0.025) {
      events.push({ beat, delay: Math.max(0, (beat.time - currentTime) / playbackRate) })
    }
    nextIndex += 1
  }
  return { events, nextIndex }
}

export function formatBarTime({ time, bpm, origin, numerator, ppq = 960 }) {
  const beatDuration = 60 / bpm
  const totalBeats = (time - origin) / beatDuration
  const bar = Math.floor(totalBeats / numerator + 1e-9) + 1
  const beatPosition = totalBeats - (bar - 1) * numerator
  const wholeBeat = Math.floor(beatPosition + 1e-9)
  const beatInBar = Math.min(numerator, wholeBeat + 1)
  const ticks = Math.max(0, Math.min(ppq - 1, Math.floor((beatPosition - wholeBeat) * ppq)))
  return `${bar}.${beatInBar}.${String(ticks).padStart(3, '0')}`
}

export function barTimeToSeconds(value, { bpm, origin, numerator, ppq = 960 }) {
  const trimmed = String(value).trim()
  const negativeBar = trimmed.startsWith('-')
  const parts = (negativeBar ? trimmed.slice(1) : trimmed).split('.').map(Number)
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return null
  const [barMagnitude, beat = 1, ticks = 0] = parts
  const bar = negativeBar ? -barMagnitude : barMagnitude
  if (beat < 1 || beat > numerator || ticks < 0 || ticks >= ppq) return null
  const totalBeats = (bar - 1) * numerator + (beat - 1) + ticks / ppq
  return origin + totalBeats * (60 / bpm)
}
