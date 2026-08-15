import type { WasteStatus } from './types'

// Fuente única de las etiquetas/colores del ciclo de vida del residuo.
//
// Antes esto vivía duplicado en `WastesListScreen`, `WasteDetailScreen` y
// `WasteStatusFlowInfo` -- tres copias que ya se habían desincronizado (las
// dos primeras seguían ofreciendo `RCH`, un estado que ninguna transición del
// backend produce). Al agregar `APR`/`SUS` habrían sido tres sitios que
// actualizar a mano.
//
// Espejo de las constantes `Waste::STATUS_*` del backend.

export const WASTE_STATUS_LABELS: Record<WasteStatus, string> = {
  BR: 'Borrador',
  DEC: 'Declarado',
  REV: 'En Revisión',
  CLS: 'Clasificado',
  APR: 'Aprobado',
  SUS: 'Suspendido',
}

export const WASTE_STATUS_BADGE_VARIANT: Record<WasteStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  BR: 'secondary',
  DEC: 'outline',
  REV: 'outline',
  CLS: 'outline',
  // `APR` es el único que habilita Solicitudes de Servicio: se lleva el énfasis.
  APR: 'default',
  SUS: 'destructive',
}

/**
 * Orden real del flujo, para el filtro del listado y el diagrama de ayuda.
 */
export const WASTE_DECLARATION_STATUSES: WasteStatus[] = ['BR', 'DEC', 'REV', 'CLS', 'APR', 'SUS']

/**
 * Un residuo solo puede usarse en una Solicitud de Servicio estando `APR`.
 * Es el gate que aplica `ServiceRequestController::resolveAndValidateItems()`.
 */
export function isWasteRequestable(status: WasteStatus): boolean {
  return status === 'APR'
}

/**
 * Estados en los que el dueño todavía puede editar el residuo. Una vez
 * aprobado, la corrección va por soporte de EcoLink -- normalmente creando un
 * residuo nuevo, porque el aprobado ya arrastra solicitudes y certificados.
 */
export function isWasteEditableByOwner(status: WasteStatus): boolean {
  return status === 'BR'
}
