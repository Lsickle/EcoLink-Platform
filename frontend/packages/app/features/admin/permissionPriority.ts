import type { RiskLevel } from './types'

// Traduce `priority_level` (1-4, columna nativa de `permissions`, ver
// esquema-bd) al mismo vocabulario de riesgo ya usado para roles
// (RiskLevel/RISK_LEVEL_CLASSES/RISK_LEVEL_LABELS en riskLevel.ts) --
// reutiliza la paleta existente en vez de inventar un sistema de color
// nuevo para el "Nivel" de un permiso (Figma "Detalle de Permiso"/"Matriz
// de Permisos"). Cualquier valor fuera de 1-4 se clampea al extremo más
// cercano en vez de lanzar -- el backend es la fuente de verdad del rango
// real, pero esta función no debe romper la UI ante un dato inesperado.
export function permissionPriorityLevel(priorityLevel: number): RiskLevel {
  if (priorityLevel >= 4) return 'critico'
  if (priorityLevel === 3) return 'alto'
  if (priorityLevel === 2) return 'medio'
  return 'bajo'
}
