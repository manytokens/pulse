export const SPECTROGRAM_HOP_SIZES = [32, 64, 128, 256, 512]

export function normalizeSpectrogramHopSize(value: unknown): number {
  const resolution = Number(value)
  return SPECTROGRAM_HOP_SIZES.includes(resolution) ? resolution : 32
}
