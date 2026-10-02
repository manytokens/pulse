// Builders for the osu! beatmap package (.osz) export.

export interface OsuMetadata {
  title: string
  artist?: string
  creator?: string
  version?: string
}

export interface OsuTimingMetadata extends OsuMetadata {
  bpm: number
  offsetMs: number
  numerator: number
}

export function sanitizeFileName(name: unknown): string {
  return String(name ?? '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
}

export function buildOsuFile({ title, artist = 'Unknown', creator = 'Pulse', version = 'Timing', bpm, offsetMs, numerator }: OsuTimingMetadata): string {
  const beatLength = 60000 / bpm
  return [
    'osu file format v14',
    '',
    '[General]',
    'AudioFilename: audio.ogg',
    'AudioLeadIn: 0',
    'PreviewTime: -1',
    'Countdown: 0',
    'SampleSet: Soft',
    'StackLeniency: 0.7',
    'Mode: 0',
    'LetterboxInBreaks: 0',
    'WidescreenStoryboard: 0',
    '',
    '[Editor]',
    'DistanceSpacing: 1',
    'BeatDivisor: 4',
    'GridSize: 32',
    'TimelineZoom: 1',
    '',
    '[Metadata]',
    `Title:${title}`,
    `TitleUnicode:${title}`,
    `Artist:${artist}`,
    `ArtistUnicode:${artist}`,
    `Creator:${creator}`,
    `Version:${version}`,
    'Source:',
    'Tags:',
    'BeatmapID:0',
    'BeatmapSetID:-1',
    '',
    '[Difficulty]',
    'HPDrainRate:5',
    'CircleSize:4',
    'OverallDifficulty:5',
    'ApproachRate:5',
    'SliderMultiplier:1.4',
    'SliderTickRate:1',
    '',
    '[TimingPoints]',
    `${Math.round(offsetMs)},${beatLength},${numerator},2,0,60,1,0`,
    '',
    '[HitObjects]',
    '',
  ].join('\r\n')
}

export function osuFileName({ title, artist = 'Unknown', creator = 'Pulse', version = 'Timing' }: OsuMetadata): string {
  return `${artist} - ${title} (${creator}) [${version}].osu`
}
