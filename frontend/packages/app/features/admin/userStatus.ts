// Cierre de brecha con Figma (lote 2026-07-14): mapeo de color semántico
// por código de UserStatus (esquema-bd/UserStatusSeeder -- los 5 códigos
// reales son PENDING_ACTIVATION/ACTIVE/LOCKED/SUSPENDED/INACTIVE, nunca
// inventar uno adicional). Antes del rediseño, UsersListScreen/
// UserDetailScreen agrupaban TODO estado no-ACTIVE bajo el mismo badge
// gris ("secondary") -- perdía la señal de que LOCKED es un estado crítico
// (bloqueo por intentos fallidos, RN-035) muy distinto de un INACTIVE/
// SUSPENDED administrativo. Mismo criterio de color que RISK_LEVEL_CLASSES
// (riskLevel.ts): rojo=crítico/bloqueado, verde=activo, ámbar=pendiente,
// gris=inactivo/suspendido -- sin inventar colores nuevos.
export const USER_STATUS_CLASSES: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  PENDING_ACTIVATION: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  LOCKED: 'bg-red-500/15 text-red-700 dark:text-red-400',
  SUSPENDED: 'bg-muted text-muted-foreground',
  INACTIVE: 'bg-muted text-muted-foreground',
}

const FALLBACK_CLASSES = 'bg-muted text-muted-foreground'

export function userStatusBadgeClasses(code: string): string {
  return USER_STATUS_CLASSES[code] ?? FALLBACK_CLASSES
}
