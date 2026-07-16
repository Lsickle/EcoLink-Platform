// Traducción de los módulos de permisos conocidos hoy (users/roles/
// permissions + audit, agregado en la revisión de seguridad del lote RBAC)
// -- el agrupamiento en sí siempre es dinámico, nunca una lista hardcodeada
// de módulos; este mapa es solo presentación (un módulo nuevo sin entrada
// aquí se muestra con su código crudo en vez de romper).
//
// Extraído de PermissionsListScreen.tsx/RoleDetailScreen.tsx/RoleWizard.tsx/
// UserDetailScreen.tsx (lote "Cerrar brecha del CRUD de Permisos vs.
// Figma") -- estaba duplicado IDÉNTICO en los 4 archivos, mismo criterio ya
// aplicado a riskLevel.ts/formatDate.ts para no repetir constantes de
// presentación compartidas.
export const MODULE_LABELS: Record<string, string> = {
  users: 'Usuarios',
  roles: 'Roles',
  permissions: 'Permisos',
  audit: 'Auditoría',
}

export function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module
}
