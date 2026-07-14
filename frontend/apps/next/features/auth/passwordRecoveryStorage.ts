// CU-009 (recuperación de contraseña): el email viaja entre
// ForgotPasswordForm y ResetPasswordForm por sessionStorage, no por query
// string -- hallazgo Baja-Media (especialista-seguridad, revisión de este
// flujo, 2026-07-13): un GET con el email en la URL queda en el historial
// del navegador (sincronizado a la nube si hay sesión de Chrome/Edge), en
// logs de acceso de servidor/CDN/load balancer (a diferencia del body de un
// POST, el query string de un GET sí se registra completo), y
// potencialmente en herramientas de monitoreo que capturan la URL completa
// (Sentry, etc.) -- problema de minimización de PII (Ley 1581), no de
// exposición de un secreto (el email no lo es por sí mismo, el código sí y
// ese nunca viaja por la URL).
//
// sessionStorage (no localStorage): se limpia al cerrar la pestaña, no se
// sincroniza entre dispositivos ni queda en logs de servidor -- localStorage
// queda descartado a propósito porque persistiría indefinidamente. Vive en
// apps/next (no en packages/app) porque `sessionStorage` es una API del
// navegador, sin equivalente directo en Expo/React Native.
const STORAGE_KEY = 'ecolink:password-recovery-email'

export function savePasswordRecoveryEmail(email: string): void {
  window.sessionStorage.setItem(STORAGE_KEY, email)
}

export function readPasswordRecoveryEmail(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  return window.sessionStorage.getItem(STORAGE_KEY)
}

export function clearPasswordRecoveryEmail(): void {
  window.sessionStorage.removeItem(STORAGE_KEY)
}
