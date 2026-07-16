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
