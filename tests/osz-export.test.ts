import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOsuFile, osuFileName, sanitizeFileName } from '../src/osz-export.ts'

test('sanitizes file names for the archive', () => {
  assert.equal(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j'), 'abcdefghij')
  assert.equal(sanitizeFileName('  spaced   name  '), 'spaced name')
  assert.equal(sanitizeFileName(null), '')
})

test('builds a valid osu file with the timing point', () => {
  const osu = buildOsuFile({ title: 'Song', bpm: 128, offsetMs: 1234, numerator: 4 })
  assert.ok(osu.startsWith('osu file format v14'))
  assert.ok(osu.includes('AudioFilename: audio.ogg'))
  assert.ok(osu.includes('Title:Song'))
  assert.ok(osu.includes('[TimingPoints]\r\n1234,468.75,4,2,0,60,1,0'))
  assert.ok(osu.includes('[HitObjects]'))
  const oddBpm = buildOsuFile({ title: 'S', bpm: 127.3, offsetMs: 0, numerator: 3 })
  assert.ok(oddBpm.includes(`0,${60000 / 127.3},3,2,0,60,1,0`))
})

test('derives the conventional .osu file name', () => {
  assert.equal(osuFileName({ title: 'Song' }), 'Unknown - Song (Pulse) [Timing].osu')
})
