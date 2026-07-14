export type PasswordStrength = 'weak' | 'fair' | 'strong'

/**
 * Refleja la política real del backend (min 8, mayúscula, minúscula,
 * número — ver AuthController::MAX_FAILED_ATTEMPTS/Password::min(8) en
 * backend/app/Http/Controllers/Api/AuthController.php). No es un medidor
 * genérico: cada regla cumplida cuenta como progreso hacia esa política,
 * más longitud extra y símbolos como señal adicional de robustez.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (!password) return 'weak'

  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password)) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++

  if (score >= 5) return 'strong'
  if (score >= 3) return 'fair'
  return 'weak'
}
