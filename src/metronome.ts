export interface MetronomeEvent {
  time: number
  step: number
}

export interface MetronomeWindowOptions {
  nextNoteTime: number
  currentStep: number
  bpm: number
  numerator: number
  now?: number
  horizon: number
}

export function secondsPerBeat(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError('BPM must be positive')
  return 60 / bpm
}

export function quantizeTransportBpm(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError('BPM must be positive')
  return Math.round(bpm)
}

export function planMetronomeWindow({ nextNoteTime, currentStep, bpm, numerator, now = -Infinity, horizon }: MetronomeWindowOptions): { events: MetronomeEvent[], nextNoteTime: number, currentStep: number } {
  const events: MetronomeEvent[] = []
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

export interface TransportTempoState {
  currentStep: number
  transportBpm: number | null
  pendingBpm: number | null
}

export function resolveTransportTempo({ currentStep, transportBpm, pendingBpm }: TransportTempoState): { transportBpm: number | null, pendingBpm: number | null } {
  if (currentStep === 0 && pendingBpm) return { transportBpm: pendingBpm, pendingBpm: null }
  return { transportBpm, pendingBpm }
}
