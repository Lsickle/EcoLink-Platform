// Etiqueta combinada "Rol - Tipo de organización" (sidebar + admin, 2026-09-28):
// EcoLink modela dos ejes de rol independientes -- el rol de sistema/RBAC del
// usuario (ej. "Administrador") y el tipo de organización de negocio al que
// pertenece (ej. "Generador") -- que se muestran combinados en UI, sin
// mezclarlos en el modelo de datos.

export type RoleWithPriority = {
  name: string
  priority_level: number
  pivot?: { is_active: boolean }
}

// Rol principal = rol ACTIVO (pivot.is_active === true, asignación vigente)
// con el priority_level MÁS BAJO (1=Dirección .. 5=Operación -- más bajo es
// más alto en jerarquía). Empate: cualquiera de los empatados sirve
// (Array.prototype.reduce se queda con el primero que encuentre). Sin ningún
// rol activo, no hay rol principal que mostrar.
//
// Criterio de "rol activo" fijado deliberadamente en `=== true` (no
// `!== false`): distinto del criterio que usa UserDetailScreen.tsx
// (isActiveRoleAssignment) para el resto de su propia UI -- diferencia de
// comportamiento ya aceptada explícitamente entre sidebar y admin, no se
// unifica aquí.
export function getPrimaryRole<T extends RoleWithPriority>(roles: T[] | undefined): T | null {
  const activeRoles = (roles ?? []).filter((role) => role.pivot?.is_active === true)
  if (activeRoles.length === 0) return null
  return activeRoles.reduce((primary, role) =>
    role.priority_level < primary.priority_level ? role : primary
  )
}

export function composeRoleOrganizationLabel(
  roleName: string | null | undefined,
  organizationBusinessRoleName: string | null | undefined
): string | null {
  if (!roleName) return null
  return organizationBusinessRoleName ? `${roleName} - ${organizationBusinessRoleName}` : roleName
}
