import assert from "node:assert/strict"
import { test } from "node:test"
import {
  DAILY_QUEUE_MAXIMUM,
  DAILY_QUEUE_MINIMUM,
  calculateDailyQueueCapacity,
} from "../hooks/lib/dispatch-capacity-policy.mjs"

test("daily queue policy pins the 5 through 10 bounds", () => {
  assert.equal(DAILY_QUEUE_MINIMUM, 5)
  assert.equal(DAILY_QUEUE_MAXIMUM, 10)
})

test("available ready work fills only the remaining total-active slots", () => {
  assert.deepEqual(calculateDailyQueueCapacity(4, 20), {
    activeCount: 4,
    eligibleCount: 20,
    availableSlots: 6,
    activationCount: 6,
    projectedActiveCount: 10,
    shortfall: 0,
    overCapacity: false,
    overage: 0,
  })

  const oneSlot = calculateDailyQueueCapacity(9, 5)
  assert.equal(oneSlot.activationCount, 1)
  assert.equal(oneSlot.projectedActiveCount, 10)
})

test("fewer than five total ready and active issues reports the shortfall", () => {
  const empty = calculateDailyQueueCapacity(0, 0)
  assert.equal(empty.activationCount, 0)
  assert.equal(empty.shortfall, 5)

  const partial = calculateDailyQueueCapacity(2, 2)
  assert.equal(partial.activationCount, 2)
  assert.equal(partial.projectedActiveCount, 4)
  assert.equal(partial.shortfall, 1)

  const minimum = calculateDailyQueueCapacity(2, 3)
  assert.equal(minimum.projectedActiveCount, 5)
  assert.equal(minimum.shortfall, 0)
})

test("a full or over-cap queue promotes nothing and never demotes", () => {
  const full = calculateDailyQueueCapacity(10, 8)
  assert.equal(full.availableSlots, 0)
  assert.equal(full.activationCount, 0)
  assert.equal(full.projectedActiveCount, 10)
  assert.equal(full.overCapacity, false)

  const over = calculateDailyQueueCapacity(12, 8)
  assert.equal(over.availableSlots, 0)
  assert.equal(over.activationCount, 0)
  assert.equal(over.projectedActiveCount, 12)
  assert.equal(over.overCapacity, true)
  assert.equal(over.overage, 2)
})

test("a repeated dispatch run counts the prior activation as active", () => {
  const first = calculateDailyQueueCapacity(3, 20)
  assert.equal(first.activationCount, 7)
  assert.equal(first.projectedActiveCount, 10)

  const repeated = calculateDailyQueueCapacity(first.projectedActiveCount, 13)
  assert.equal(repeated.activationCount, 0)
  assert.equal(repeated.projectedActiveCount, 10)
})

test("invalid counts fail closed", () => {
  for (const args of [
    [-1, 1],
    [1, -1],
    [1.5, 2],
    [Number.NaN, 2],
  ]) {
    assert.throws(
      () => calculateDailyQueueCapacity(...args),
      /non-negative safe integer/,
    )
  }
})
