// Traducción de las acciones reales del catálogo de permisos (create/read/
// update/delete/activate/deactivate/reset-password/assign/export -- ver
// PermissionSeeder.php, los 16 permisos de los 4 módulos reales) para las
// columnas de la Matriz de Permisos ("Por Rol", Figma nodo 432:2736).
// Mismo criterio que moduleLabels.ts: es solo un diccionario de
// presentación -- qué acciones EXISTEN siempre se deriva del catálogo ya
// cargado (nunca se asume esta lista como exhaustiva ni se usa para
// validar), una acción nueva sin entrada aquí simplemente se muestra con
// su código crudo en vez de romper.
export const ACTION_LABELS: Record<string, string> = {
  create: 'Crear',
  read: 'Consultar',
  update: 'Modificar',
  delete: 'Eliminar',
  activate: 'Activar',
  deactivate: 'Inactivar',
  'reset-password': 'Restablecer',
  assign: 'Asignar',
  export: 'Exportar',
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

// Orden de presentación de columnas en la tabla "Por Rol" -- puramente
// cosmético, nunca se usa para decidir qué acciones existen (eso sigue
// siendo dinámico vía Array.from(new Set(catalog.map(p => p.action)))).
// Una acción del catálogo ausente de este orden cae al final, ordenada
// alfabéticamente -- no rompe si el backend agrega una acción nueva.
const ACTION_DISPLAY_ORDER = [
  'read',
  'create',
  'update',
  'delete',
  'activate',
  'deactivate',
  'reset-password',
  'assign',
  'export',
]

export function sortActions(actions: string[]): string[] {
  return Array.from(new Set(actions)).sort((a, b) => {
    const indexA = ACTION_DISPLAY_ORDER.indexOf(a)
    const indexB = ACTION_DISPLAY_ORDER.indexOf(b)
    if (indexA === -1 && indexB === -1) return a.localeCompare(b)
    if (indexA === -1) return 1
    if (indexB === -1) return -1
    return indexA - indexB
  })
}
