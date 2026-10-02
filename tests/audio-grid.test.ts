import assert from 'node:assert/strict'
import test from 'node:test'
import { barTimeToSeconds, collectScheduledBeats, findNextBeatIndex, formatBarTime, generateBeatGrid } from '../src/audio-grid.ts'

test('generates bar markers from BPM, origin, and meter', () => {
  const grid = generateBeatGrid({ duration: 10, bpm: 120, origin: 0.25, numerator: 4, denominator: 4 })
  assert.deepEqual(
    grid.filter(({ isBar }) => isBar).map(({ time }) => time),
    [0.25, 2.25, 4.25, 6.25, 8.25],
  )
})

test('treats BPM as beats per minute for the selected meter', () => {
  const grid = generateBeatGrid({ duration: 7, bpm: 120, origin: 0, numerator: 6, denominator: 8 })
  assert.deepEqual(
    grid.filter(({ isBar }) => isBar).map(({ time }) => time),
    [0, 3, 6],
  )
})

test('schedules click beats against media time at the active playback rate', () => {
  const grid = generateBeatGrid({ duration: 4, bpm: 120, origin: 0, numerator: 4, denominator: 4 })
  const startIndex = findNextBeatIndex(grid, 0.45)
  const schedule = collectScheduledBeats({ grid, startIndex, currentTime: 0.45, playbackRate: 2 })
  assert.equal(schedule.events.length, 1)
  assert.equal(schedule.events[0].beat.time, 0.5)
  assert.ok(Math.abs(schedule.events[0].delay - 0.025) < 1e-9)
})

test('converts between media seconds and bar.beat.tick time', () => {
  const settings = { bpm: 120, origin: 0.25, numerator: 4 }
  assert.equal(formatBarTime({ time: 5.5, ...settings }), '3.3.480')
  assert.equal(barTimeToSeconds('3.3.480', settings), 5.5)
})

test('extends the grid and bar time before the origin', () => {
  const grid = generateBeatGrid({ duration: 10, bpm: 120, origin: 4.25, numerator: 4, denominator: 4 })
  assert.deepEqual(
    grid.filter(({ isBar }) => isBar).map(({ time }) => time),
    [0.25, 2.25, 4.25, 6.25, 8.25],
  )
  assert.deepEqual(grid.filter(({ isBar }) => isBar).map(({ bar }) => bar), [-1, 0, 1, 2, 3])
  const settings = { bpm: 120, origin: 4.25, numerator: 4 }
  assert.equal(formatBarTime({ time: 3.25, ...settings }), '0.3.000')
  assert.equal(barTimeToSeconds('0.3.000', settings), 3.25)
  assert.equal(formatBarTime({ time: 2.25, ...settings }), '0.1.000')
  assert.equal(barTimeToSeconds('-1.1.000', settings), 0.25)
})

test('a BPM change rebuilds the next and following tick times', () => {
  const oldGrid = generateBeatGrid({ duration: 3, bpm: 120, origin: 0, numerator: 4, denominator: 4 })
  const newGrid = generateBeatGrid({ duration: 3, bpm: 90, origin: 0, numerator: 4, denominator: 4 })
  assert.deepEqual(oldGrid.slice(1, 4).map(({ time }) => time), [0.5, 1, 1.5])
  assert.deepEqual(newGrid.slice(1, 4).map(({ time }) => time), [2 / 3, 4 / 3, 2])
  const nextIndex = findNextBeatIndex(newGrid, 0.6)
  const schedule = collectScheduledBeats({ grid: newGrid, startIndex: nextIndex, currentTime: 0.6, playbackRate: 1 })
  assert.ok(Math.abs(schedule.events[0].delay - 1 / 15) < 1e-9)
})
