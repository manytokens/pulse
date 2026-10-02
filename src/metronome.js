export function secondsPerBeat(bpm) {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError('BPM must be positive')
  return 60 / bpm
}

export function quantizeTransportBpm(bpm) {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError('BPM must be positive')
  return Math.round(bpm)
}

export function planMetronomeWindow({ nextNoteTime, currentStep, bpm, numerator, now = -Infinity, horizon }) {
  const events = []
  const stepDuration = secondsPerBeat(bpm)
  let nextTime = nextNoteTime
  let step = currentStep

  if (nextTime < now) {
    const missedBeats = Math.ceil((now - nextTime) / stepDuration)
    nextTime += missedBeats * stepDuration
    step = (step + missedBeats) % numerator
  }

  while (nextTime < horizon) {
    events.push({ time: nextTime, step })
    nextTime += stepDuration
    step = (step + 1) % numerator
  }

  return { events, nextNoteTime: nextTime, currentStep: step }
}

export function resolveTransportTempo({ currentStep, transportBpm, pendingBpm }) {
  if (currentStep === 0 && pendingBpm) return { transportBpm: pendingBpm, pendingBpm: null }
  return { transportBpm, pendingBpm }
}
