import { useEffect, useState } from 'react'

/**
 * Cuenta regresiva en memoria para el rate limiting de /api/login y
 * /api/register (RateLimiter::for('login'/'register') en
 * backend/app/Providers/AppServiceProvider.php, ver RateLimitError en
 * features/auth/api.ts). No depende del DOM -- vive en packages/app para
 * reusarse también desde la futura app móvil (Expo).
 */
export function useRateLimitCountdown() {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null)
  const isRateLimited = secondsRemaining !== null && secondsRemaining > 0

  // Un único setInterval por ciclo de cuenta regresiva (en vez de
  // re-programar un setTimeout en cada tick) para que decremente de forma
  // confiable sin depender de que React re-renderice entre cada segundo.
  useEffect(() => {
    if (!isRateLimited) {
      return
    }

    const intervalId = setInterval(() => {
      setSecondsRemaining((current) => (current !== null && current > 1 ? current - 1 : null))
    }, 1000)

    return () => clearInterval(intervalId)
  }, [isRateLimited])

  return {
    secondsRemaining,
    isRateLimited,
    start: (seconds: number) => setSecondsRemaining(seconds),
  }
}
