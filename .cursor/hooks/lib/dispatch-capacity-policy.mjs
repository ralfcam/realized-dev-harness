/**
 * Pure daily-queue capacity policy for /dispatch.
 *
 * Existing Todo issues in the live current cycle count before any Backlog
 * activation. The minimum is a reporting target; the maximum is a hard cap
 * on new activation. Live Linear I/O and issue ranking stay in dispatch.md.
 */

export const DAILY_QUEUE_MINIMUM = 5
export const DAILY_QUEUE_MAXIMUM = 10

function requireCount(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`)
  }
}

export function calculateDailyQueueCapacity(activeCount, eligibleCount) {
  requireCount("activeCount", activeCount)
  requireCount("eligibleCount", eligibleCount)

  const availableSlots = Math.max(0, DAILY_QUEUE_MAXIMUM - activeCount)
  const activationCount = Math.min(eligibleCount, availableSlots)
  const projectedActiveCount = activeCount + activationCount

  return {
    activeCount,
    eligibleCount,
    availableSlots,
    activationCount,
    projectedActiveCount,
    shortfall: Math.max(0, DAILY_QUEUE_MINIMUM - projectedActiveCount),
    overCapacity: activeCount > DAILY_QUEUE_MAXIMUM,
    overage: Math.max(0, activeCount - DAILY_QUEUE_MAXIMUM),
  }
}
