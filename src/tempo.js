function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function requiredTapsForLock(numerator) {
  if (!Number.isInteger(numerator) || numerator < 1) throw new RangeError('Numerator must be positive')
  return numerator * 2 + 1
}

export function estimateRobustPeriod(timestamps) {
  const slopes = []
  for (let start = 0; start < timestamps.length - 1; start += 1) {
    for (let end = start + 1; end < timestamps.length; end += 1) {
      slopes.push((timestamps[end] - timestamps[start]) / (end - start))
    }
  }
  return median(slopes)
}

export function calculateCorrectedBpm(timestamps, previousBpm, isStable) {
  const intervalCount = timestamps.length - 1
  const robustBpm = 60000 / estimateRobustPeriod(timestamps)
  if (intervalCount < 3 || previousBpm === null) return robustBpm

  const difference = Math.abs(robustBpm - previousBpm) / previousBpm
  const smoothing = difference > 0.08 ? 0.45 : difference > 0.015 ? 0.32 : isStable ? 0.18 : 0.4
  return previousBpm * (1 - smoothing) + robustBpm * smoothing
}
