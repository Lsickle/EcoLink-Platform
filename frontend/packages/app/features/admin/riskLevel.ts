import type { RiskLevel } from './types'

// bajo=verde, medio=amarillo, alto=naranja, critico=rojo -- mapeo a las
// variantes de Badge ya usadas en el tema (sin inventar colores nuevos).
// Extraído de RoleDetailScreen.tsx para compartirlo con RolesListScreen
// (Figma "Roles Management", lote 3) sin duplicar la paleta.
export const RISK_LEVEL_CLASSES: Record<RiskLevel, string> = {
  bajo: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  medio: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  alto: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  critico: 'bg-red-500/15 text-red-700 dark:text-red-400',
}

// Versión sólida (sin opacidad reducida) de la misma paleta, para
// indicadores tipo barra/gauge donde el segmento resaltado necesita
// contraste contra el fondo bg-muted -- RISK_LEVEL_CLASSES está pensado
// para badges con texto encima y su 15% de opacidad es casi indistinguible
// del fondo en una barra pequeña (h-2). Mismos matices de color, sin
// inventar colores nuevos.
export const RISK_LEVEL_BAR_CLASSES: Record<RiskLevel, string> = {
  bajo: 'bg-emerald-500',
  medio: 'bg-yellow-500',
  alto: 'bg-orange-500',
  critico: 'bg-red-500',
}

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  bajo: 'bajo',
  medio: 'medio',
  alto: 'alto',
  critico: 'crítico',
}

/**
 * Normaliza el valor que llega del backend antes de indexar los mapas de
 * arriba.
 *
 * Hace falta porque el dato NO está normalizado en base de datos: el DEFAULT de
 * la columna `organizations.risk_level` es `'BAJO'` (mayúscula) mientras
 * `OrganizationController::store()` fuerza minúscula -- inconsistencia ya
 * documentada en el docblock de ese controller. Cualquier organización creada
 * sin pasar por ese endpoint (seeder, carga masiva, inserción directa) llega
 * con `'BAJO'`, y ahí `RISK_LEVEL_CLASSES[...]` devolvía `undefined` y tumbaba
 * la pantalla entera de detalle con un `TypeError` (encontrado en pruebas de
 * navegador, 2026-08-15).
 *
 * Un valor de dato inesperado no debe dejar la pantalla en blanco: se cae a
 * `bajo`, que es además el default que pretendía la columna.
 */
export function normalizeRiskLevel(value: string | null | undefined): RiskLevel {
  const normalized = (value ?? '').toLowerCase()

  return normalized in RISK_LEVEL_CLASSES ? (normalized as RiskLevel) : 'bajo'
}
