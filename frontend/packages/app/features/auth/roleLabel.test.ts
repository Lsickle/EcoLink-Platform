import { describe, expect, test } from 'vitest'
import { composeRoleOrganizationLabel, getPrimaryRole, type RoleWithPriority } from './roleLabel'

describe('composeRoleOrganizationLabel', () => {
  test('returns null when there is no role', () => {
    expect(composeRoleOrganizationLabel(null, 'Generador')).toBeNull()
    expect(composeRoleOrganizationLabel(undefined, 'Generador')).toBeNull()
  })

  test('returns only the role name when there is no organization business role type', () => {
    expect(composeRoleOrganizationLabel('Administrador', null)).toBe('Administrador')
    expect(composeRoleOrganizationLabel('Administrador', undefined)).toBe('Administrador')
  })

  test('combines role and organization business role type with " - "', () => {
    expect(composeRoleOrganizationLabel('Administrador', 'Generador')).toBe('Administrador - Generador')
  })
})

describe('getPrimaryRole', () => {
  test('returns null when there are no roles', () => {
    expect(getPrimaryRole(undefined)).toBeNull()
    expect(getPrimaryRole([])).toBeNull()
  })

  test('returns null when all roles are inactive', () => {
    const roles: RoleWithPriority[] = [
      { name: 'Logística', priority_level: 3, pivot: { is_active: false } },
    ]
    expect(getPrimaryRole(roles)).toBeNull()
  })

  test('returns the active role with the lowest priority_level when there are several active roles', () => {
    const roles: RoleWithPriority[] = [
      { name: 'Logística', priority_level: 3, pivot: { is_active: true } },
      { name: 'Administrador', priority_level: 1, pivot: { is_active: true } },
      { name: 'Operación', priority_level: 5, pivot: { is_active: false } },
    ]
    expect(getPrimaryRole(roles)?.name).toBe('Administrador')
  })
})
