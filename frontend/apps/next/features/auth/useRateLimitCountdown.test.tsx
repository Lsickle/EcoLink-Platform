import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useRateLimitCountdown } from 'app/features/auth/useRateLimitCountdown'

// RN-181: cuenta regresiva para el rate limiting de /api/login y
// /api/register (ver RateLimitError en app/features/auth/api.ts). Vive en
// packages/app para reusarse desde la futura app móvil.
describe('useRateLimitCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('starts inactive with no seconds remaining', () => {
    const { result } = renderHook(() => useRateLimitCountdown())

    expect(result.current.secondsRemaining).toBeNull()
    expect(result.current.isRateLimited).toBe(false)
  })

  test('start() sets the countdown and ticks down every second until it clears', () => {
    const { result } = renderHook(() => useRateLimitCountdown())

    act(() => {
      result.current.start(3)
    })
    expect(result.current.secondsRemaining).toBe(3)
    expect(result.current.isRateLimited).toBe(true)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.secondsRemaining).toBe(2)

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current.secondsRemaining).toBeNull()
    expect(result.current.isRateLimited).toBe(false)
  })
})
