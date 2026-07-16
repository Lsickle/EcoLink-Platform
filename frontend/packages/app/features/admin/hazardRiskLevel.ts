// Mapeo confirmado en el diseño del proyecto para el catálogo
// "Características de Peligrosidad" (`hazard_characteristics.risk_level`,
// entero 1-9, mayor = más peligroso -- ver esquema-bd item 14 y
// HazardCharacteristicController). Los 8 valores realmente sembrados solo
// usan {9,7,5,3,1} (RADIOACTIVO/EXPLOSIVO=9, TOXICO/INFECCIOSO=7,
// CORROSIVO/REACTIVO=5, INFLAMABLE/ECOTOXICO=3, IRRITANTE=1), pero la
// validación del backend admite cualquier entero 1-9 -- esta función usa
// umbrales `>=` (no un mapa exacto) para no romper ante un valor
// intermedio que el backend sí aceptaría.
//
// Distinto del RiskLevel de 4 niveles ya usado para roles/permisos
// (riskLevel.ts/permissionPriority.ts) -- aquí son 5 niveles cualitativos
// sobre una escala 1-9, no el mismo dominio, así que se modela como un tipo
// separado en vez de reutilizar `RiskLevel` con una escala distinta.
export type HazardRiskLevel = 'critico' | 'alto' | 'medio' | 'bajo' | 'minimo'

export function hazardRiskLevel(riskLevel: number): HazardRiskLevel {
  if (riskLevel >= 9) return 'critico'
  if (riskLevel >= 7) return 'alto'
  if (riskLevel >= 5) return 'medio'
  if (riskLevel >= 3) return 'bajo'
  return 'minimo'
}

export const HAZARD_RISK_LEVEL_LABELS: Record<HazardRiskLevel, string> = {
  critico: 'Crítico',
  alto: 'Alto',
  medio: 'Medio',
  bajo: 'Bajo',
  minimo: 'Mínimo',
}

// rojo=Crítico/Alto, naranja=Medio, verde/gris=Bajo/Mínimo (criterio pedido
// explícitamente para este catálogo) -- mismas clases Tailwind literales que
// RISK_LEVEL_CLASSES en riskLevel.ts, sin inventar una paleta nueva.
export const HAZARD_RISK_LEVEL_CLASSES: Record<HazardRiskLevel, string> = {
  critico: 'bg-red-500/15 text-red-700 dark:text-red-400',
  alto: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  medio: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  bajo: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  minimo: 'bg-slate-500/15 text-slate-700 dark:text-slate-400',
}
