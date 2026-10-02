import assert from 'node:assert/strict'
import test from 'node:test'
import { chooseTimeTickStep, formatClockTime, snapAdjacent, visibleGridRange } from '../src/transport.js'

test('snaps to the adjacent beat in either direction', () => {
  const grid = { origin: 1, stepLength: 0.5 }
  assert.equal(snapAdjacent(1.7, { ...grid, direction: 1 }), 2)
  assert.equal(snapAdjacent(1.7, { ...grid, direction: -1 }), 1.5)
  // Exactly on a beat moves a full step, not zero.
  assert.equal(snapAdjacent(2, { ...grid, direction: 1 }), 2.5)
  assert.equal(snapAdjacent(2, { ...grid, direction: -1 }), 1.5)
  // Works before the origin too.
  assert.equal(snapAdjacent(0.8, { ...grid, direction: -1 }), 0.5)
  // Invalid step length is a no-op.
  assert.equal(snapAdjacent(3, { origin: 0, stepLength: 0, direction: 1 }), 3)
})

test('chooses readable time tick steps for any zoom', () => {
  assert.equal(chooseTimeTickStep(800), 0.1)
  assert.equal(chooseTimeTickStep(40), 2)
  assert.equal(chooseTimeTickStep(2), 60)
  assert.equal(chooseTimeTickStep(0.01), 300)
})

test('formats clock times', () => {
  assert.equal(formatClockTime(0), '0:00')
  assert.equal(formatClockTime(65), '1:05')
  assert.equal(formatClockTime(65.47, { fractional: true }), '1:05.4')
  assert.equal(formatClockTime(-3), '0:00')
})

test('computes visible grid index ranges with padding', () => {
  const range = visibleGridRange({ viewStart: 10, viewEnd: 20, origin: 0, stepLength: 1 })
  assert.ok(range.from <= 10 && range.from >= 8)
  assert.ok(range.to >= 20)
  // Beats before the origin get negative indices (bars 0, -1, ...).
  const preOrigin = visibleGridRange({ viewStart: 0, viewEnd: 10, origin: 5, stepLength: 1 })
  assert.ok(preOrigin.from <= -5)
  const empty = visibleGridRange({ viewStart: 0, viewEnd: 10, origin: 0, stepLength: 0 })
  assert.ok(empty.to < empty.from)
})
