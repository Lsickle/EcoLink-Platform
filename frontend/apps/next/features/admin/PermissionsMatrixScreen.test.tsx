import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PermissionsMatrixScreen } from './PermissionsMatrixScreen'

const fetchRolesMock = vi.fn()
const fetchRoleMock = vi.fn()
const fetchPermissionsMock = vi.fn()
const fetchPermissionMatrixByModuleMock = vi.fn()
const assignPermissionToRoleMock = vi.fn()
const revokePermissionFromRoleMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchRoles: (...args: unknown[]) => fetchRolesMock(...args),
    fetchRole: (...args: unknown[]) => fetchRoleMock(...args),
    fetchPermissions: (...args: unknown[]) => fetchPermissionsMock(...args),
    fetchPermissionMatrixByModule: (...args: unknown[]) => fetchPermissionMatrixByModuleMock(...args),
    assignPermissionToRole: (...args: unknown[]) => assignPermissionToRoleMock(...args),
    revokePermissionFromRole: (...args: unknown[]) => revokePermissionFromRoleMock(...args),
  }
})

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function role(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 2,
    uuid: 'r-2',
    code: 'COORDINADOR',
    name: 'Coordinador',
    description: null,
    is_system: false,
    is_editable: true,
    priority_level: 3,
    is_active: true,
    tenant_organization_id: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    users_count: 1,
    permissions_count: 1,
    risk_level: 'medio',
    ...overrides,
  }
}

function permission(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    code: 'users.create',
    name: 'Crear usuarios',
    module: 'users',
    action: 'create',
    scope: 'tenant',
    description: null,
    priority_level: 1,
    is_system: true,
    is_critical: false,
    is_active: true,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  }
}

function paginated<T>(data: T[]) {
  return { data, current_page: 1, last_page: 1, total: data.length, per_page: 100 }
}

async function selectOption(comboboxName: RegExp, optionName: string) {
  fireEvent.click(screen.getByRole('combobox', { name: comboboxName }))
  const option = await screen.findByRole('option', { name: optionName })
  await act(async () => {
    fireEvent.pointerDown(option)
    fireEvent.click(option)
  })
}

async function goToTab(name: string) {
  const tab = await screen.findByRole('tab', { name })
  await act(async () => {
    fireEvent.click(tab)
  })
}

describe('PermissionsMatrixScreen', () => {
  beforeEach(() => {
    fetchRolesMock.mockResolvedValue(
      paginated([role({ id: 2, name: 'Coordinador', is_editable: true }), role({ id: 3, name: 'Supervisor', is_editable: true })])
    )
    fetchRoleMock.mockImplementation((id: number) => {
      if (id === 2) {
        return Promise.resolve({
          role: role({ id: 2, name: 'Coordinador', permissions: [permission({ id: 1, name: 'Crear usuarios' })] }),
        })
      }
      return Promise.resolve({
        role: role({
          id: 3,
          name: 'Supervisor',
          permissions: [
            permission({ id: 1, name: 'Crear usuarios' }),
            permission({ id: 2, name: 'Eliminar usuarios', code: 'users.delete', action: 'delete' }),
          ],
        }),
      })
    })
    fetchPermissionsMock.mockResolvedValue(
      paginated([
        permission({ id: 1, name: 'Crear usuarios', action: 'create' }),
        permission({ id: 2, name: 'Eliminar usuarios', code: 'users.delete', action: 'delete' }),
      ])
    )
    fetchPermissionMatrixByModuleMock.mockResolvedValue({
      module: 'users',
      permissions: [permission({ id: 1, name: 'Crear usuarios' }), permission({ id: 2, name: 'Eliminar usuarios', code: 'users.delete', action: 'delete' })],
      roles: [role({ id: 2, name: 'Coordinador', is_editable: true }), role({ id: 3, name: 'Supervisor', is_editable: false })],
      assignments: { '1': [2] },
    })
  })

  afterEach(() => {
    fetchRolesMock.mockReset()
    fetchRoleMock.mockReset()
    fetchPermissionsMock.mockReset()
    fetchPermissionMatrixByModuleMock.mockReset()
    assignPermissionToRoleMock.mockReset()
    revokePermissionFromRoleMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the permissions.read permission via useRequireAuth', async () => {
    render(<PermissionsMatrixScreen />)
    await screen.findByRole('tab', { name: 'Por Rol' })

    expect(useRequireAuthMock).toHaveBeenCalledWith('permissions.read')
  })

  test('renders the 3 sub-views as tabs', async () => {
    render(<PermissionsMatrixScreen />)

    expect(await screen.findByRole('tab', { name: 'Por Rol' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Por Módulo' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Comparativa' })).toBeInTheDocument()
  })

  // Layout compartido (buscador+selects a la izquierda, tabs a la derecha):
  // construido una sola vez en el padre -- lo que cambia por sub-vista son
  // los selects específicos, nunca la fila en sí.
  test('shares the same filters+tabs bar across the 3 sub-views, with each sub-view contributing only its own selects', async () => {
    render(<PermissionsMatrixScreen />)
    await screen.findByRole('tab', { name: 'Por Rol' })

    // El buscador es el mismo control en las 3 pestañas.
    expect(screen.getByRole('textbox', { name: /buscar en la matriz de permisos/i })).toBeInTheDocument()

    // "Por Rol": Módulo + Estado + Nivel, sin "Solo Diferencias".
    expect(screen.getByRole('combobox', { name: /filtrar por módulo/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /filtrar por estado/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /filtrar por nivel/i })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /mostrar solo diferencias/i })).not.toBeInTheDocument()

    // "Por Módulo": Estado + Nivel, sin Módulo (eso ya lo aporta el
    // contexto "Módulo: [Select]" de la propia sub-vista) ni "Solo
    // Diferencias".
    await goToTab('Por Módulo')
    expect(screen.queryByRole('combobox', { name: /filtrar por módulo/i })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /filtrar por estado/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /filtrar por nivel/i })).toBeInTheDocument()

    // "Comparativa": Módulo + Nivel + "Solo Diferencias", sin Estado.
    await goToTab('Comparativa')
    expect(screen.getByRole('combobox', { name: /filtrar por módulo/i })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /filtrar por estado/i })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /filtrar por nivel/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /mostrar solo diferencias/i })).toBeInTheDocument()

    // El buscador sigue siendo el mismo control tras cambiar de pestaña.
    expect(screen.getByRole('textbox', { name: /buscar en la matriz de permisos/i })).toBeInTheDocument()
  })

  test('"Por Rol": renders a real table (module rows x union-of-actions columns + Nivel), toggling an unassigned permission calls assignPermissionToRole, toggling an assigned one calls revokePermissionFromRole', async () => {
    assignPermissionToRoleMock.mockResolvedValue({ message: 'ok' })
    revokePermissionFromRoleMock.mockResolvedValue({ message: 'ok' })
    render(<PermissionsMatrixScreen />)
    await screen.findByRole('tab', { name: 'Por Rol' })

    await selectOption(/^rol$/i, 'Coordinador')

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Módulo' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Crear' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Eliminar' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Nivel' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Usuarios' })).toBeInTheDocument()

    const assignedCheckbox = await screen.findByRole('checkbox', { name: 'Crear usuarios' })
    expect(assignedCheckbox).toBeChecked()
    await act(async () => {
      fireEvent.click(assignedCheckbox)
    })
    expect(revokePermissionFromRoleMock).toHaveBeenCalledWith(1, 2)

    const unassignedCheckbox = screen.getByRole('checkbox', { name: 'Eliminar usuarios' })
    expect(unassignedCheckbox).not.toBeChecked()
    await act(async () => {
      fireEvent.click(unassignedCheckbox)
    })
    expect(assignPermissionToRoleMock).toHaveBeenCalledWith(2, { role_id: 2 })
  })

  // Ajuste #3 (2026-07-14): feedback visual en la celda mientras el toggle
  // está en vuelo -- el checkbox se reemplaza por un spinner (Loader2) y
  // vuelve a aparecer cuando la petición resuelve.
  test('"Por Rol": shows a loading spinner in the cell while the toggle request is pending, then reverts to the checkbox', async () => {
    let resolveRevoke: (value: unknown) => void = () => {}
    revokePermissionFromRoleMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRevoke = resolve
        })
    )
    render(<PermissionsMatrixScreen />)
    await screen.findByRole('tab', { name: 'Por Rol' })
    await selectOption(/^rol$/i, 'Coordinador')

    const assignedCheckbox = await screen.findByRole('checkbox', { name: 'Crear usuarios' })
    await act(async () => {
      fireEvent.click(assignedCheckbox)
    })

    expect(screen.queryByRole('checkbox', { name: 'Crear usuarios' })).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: /actualizando/i })).toBeInTheDocument()

    await act(async () => {
      resolveRevoke({ message: 'ok' })
    })

    expect(await screen.findByRole('checkbox', { name: 'Crear usuarios' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: /actualizando/i })).not.toBeInTheDocument()
  })

  test('"Por Rol": disables every checkbox when the role is not editable', async () => {
    fetchRoleMock.mockResolvedValueOnce({
      role: role({ id: 2, name: 'Coordinador', is_editable: false, permissions: [permission({ id: 1 })] }),
    })
    render(<PermissionsMatrixScreen />)
    await screen.findByRole('tab', { name: 'Por Rol' })

    await selectOption(/^rol$/i, 'Coordinador')

    expect(await screen.findByRole('checkbox', { name: 'Crear usuarios' })).toHaveAttribute('aria-disabled', 'true')
  })

  test('"Por Rol": count badges reflect the selected role\'s real data', async () => {
    render(<PermissionsMatrixScreen />)
    await screen.findByRole('tab', { name: 'Por Rol' })

    await selectOption(/^rol$/i, 'Coordinador')

    await screen.findByRole('checkbox', { name: 'Crear usuarios' })
    expect(screen.getByText('1 módulos')).toBeInTheDocument()
    expect(screen.getByText('1/2 permisos')).toBeInTheDocument()
    expect(screen.getByText('0 críticos')).toBeInTheDocument()
    expect(screen.getByText('1 usuarios')).toBeInTheDocument()
  })

  test('"Por Rol": the Módulo filter narrows the module rows shown', async () => {
    render(<PermissionsMatrixScreen />)
    await screen.findByRole('tab', { name: 'Por Rol' })

    await selectOption(/^rol$/i, 'Coordinador')
    expect(await screen.findByRole('cell', { name: 'Usuarios' })).toBeInTheDocument()

    await selectOption(/filtrar por módulo/i, 'Roles')

    expect(screen.queryByRole('cell', { name: 'Usuarios' })).not.toBeInTheDocument()
    expect(screen.getByText('Ningún módulo coincide con los filtros.')).toBeInTheDocument()
  })

  test('"Por Módulo": renders a real table (permission rows x role columns + Nivel)', async () => {
    render(<PermissionsMatrixScreen />)
    await goToTab('Por Módulo')

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Permiso' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Nivel' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Coordinador' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Supervisor' })).toBeInTheDocument()
  })

  test('"Por Módulo": toggling an assigned cell calls revokePermissionFromRole, an unassigned one calls assignPermissionToRole', async () => {
    assignPermissionToRoleMock.mockResolvedValue({ message: 'ok' })
    revokePermissionFromRoleMock.mockResolvedValue({ message: 'ok' })
    render(<PermissionsMatrixScreen />)

    await goToTab('Por Módulo')

    const assignedCell = await screen.findByRole('checkbox', { name: 'Crear usuarios - Coordinador' })
    expect(assignedCell).toBeChecked()
    await act(async () => {
      fireEvent.click(assignedCell)
    })
    expect(revokePermissionFromRoleMock).toHaveBeenCalledWith(1, 2)

    const unassignedCell = screen.getByRole('checkbox', { name: 'Eliminar usuarios - Coordinador' })
    expect(unassignedCell).not.toBeChecked()
    await act(async () => {
      fireEvent.click(unassignedCell)
    })
    expect(assignPermissionToRoleMock).toHaveBeenCalledWith(2, { role_id: 2 })
  })

  test('"Por Módulo": shows a loading spinner in the cell while the toggle request is pending, then reverts to the checkbox', async () => {
    let resolveRevoke: (value: unknown) => void = () => {}
    revokePermissionFromRoleMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRevoke = resolve
        })
    )
    render(<PermissionsMatrixScreen />)
    await goToTab('Por Módulo')

    const assignedCell = await screen.findByRole('checkbox', { name: 'Crear usuarios - Coordinador' })
    await act(async () => {
      fireEvent.click(assignedCell)
    })

    expect(screen.queryByRole('checkbox', { name: 'Crear usuarios - Coordinador' })).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: /actualizando/i })).toBeInTheDocument()

    await act(async () => {
      resolveRevoke({ message: 'ok' })
    })

    expect(await screen.findByRole('checkbox', { name: 'Crear usuarios - Coordinador' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: /actualizando/i })).not.toBeInTheDocument()
  })

  test('"Por Módulo": disables the whole column of a non-editable role', async () => {
    render(<PermissionsMatrixScreen />)

    await goToTab('Por Módulo')

    expect(await screen.findByRole('checkbox', { name: 'Crear usuarios - Supervisor' })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    expect(screen.getByRole('checkbox', { name: 'Eliminar usuarios - Supervisor' })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
  })

  test('"Por Módulo": count badges reflect the selected module\'s real data', async () => {
    render(<PermissionsMatrixScreen />)
    await goToTab('Por Módulo')

    await screen.findByRole('checkbox', { name: 'Crear usuarios - Coordinador' })
    expect(screen.getByText('2 permisos')).toBeInTheDocument()
    expect(screen.getByText('2 roles')).toBeInTheDocument()
    expect(screen.getByText('0 críticos')).toBeInTheDocument()
  })

  test('"Por Módulo": the Nivel filter narrows the permission rows shown', async () => {
    render(<PermissionsMatrixScreen />)
    await goToTab('Por Módulo')

    await screen.findByRole('checkbox', { name: 'Crear usuarios - Coordinador' })

    await selectOption(/filtrar por nivel/i, 'Alto')

    expect(screen.queryByRole('checkbox', { name: 'Crear usuarios - Coordinador' })).not.toBeInTheDocument()
    expect(screen.getByText('Ningún permiso coincide con los filtros.')).toBeInTheDocument()
  })

  test('"Comparativa": renders a single table grouped by module, computes the diff between two roles (at least one match and one difference), read-only (no checkboxes)', async () => {
    render(<PermissionsMatrixScreen />)

    await goToTab('Comparativa')

    await selectOption(/^rol a$/i, 'Coordinador')
    await selectOption(/^rol b$/i, 'Supervisor')

    expect(await screen.findByRole('table')).toBeInTheDocument()
    // El módulo aparece una sola vez (fila de sección), no repetido por fila.
    expect(screen.getAllByText('Usuarios')).toHaveLength(1)

    // permission 1 ("Crear usuarios") está en ambos roles -> "Igual".
    // permission 2 ("Eliminar usuarios") solo está en Supervisor -> "Diferente".
    const matchRow = (await screen.findByText('Crear usuarios')).closest('tr')
    const diffRow = screen.getByText('Eliminar usuarios').closest('tr')
    expect(matchRow && within(matchRow).getByText('Igual')).toBeInTheDocument()
    expect(diffRow && within(diffRow).getByText('Diferente')).toBeInTheDocument()

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  test('"Comparativa": count badges show the real number of differences and matches', async () => {
    render(<PermissionsMatrixScreen />)

    await goToTab('Comparativa')

    await selectOption(/^rol a$/i, 'Coordinador')
    await selectOption(/^rol b$/i, 'Supervisor')

    await screen.findByText('Crear usuarios')
    expect(screen.getByText('1 diferencias')).toBeInTheDocument()
    expect(screen.getByText('1 iguales')).toBeInTheDocument()
  })

  test('"Comparativa": "Solo Diferencias" hides rows in state "Igual"', async () => {
    render(<PermissionsMatrixScreen />)

    await goToTab('Comparativa')

    await selectOption(/^rol a$/i, 'Coordinador')
    await selectOption(/^rol b$/i, 'Supervisor')
    await screen.findByText('Crear usuarios')

    await selectOption(/mostrar solo diferencias/i, 'Solo diferencias')

    expect(screen.queryByText('Crear usuarios')).not.toBeInTheDocument()
    expect(screen.getByText('Eliminar usuarios')).toBeInTheDocument()
  })

  test('"Comparativa": "Intercambiar Roles" swaps Rol A and Rol B', async () => {
    render(<PermissionsMatrixScreen />)

    await goToTab('Comparativa')

    await selectOption(/^rol a$/i, 'Coordinador')
    await selectOption(/^rol b$/i, 'Supervisor')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /intercambiar roles/i }))
    })

    expect(screen.getByRole('combobox', { name: /^rol a$/i })).toHaveTextContent('Supervisor')
    expect(screen.getByRole('combobox', { name: /^rol b$/i })).toHaveTextContent('Coordinador')
  })

  // Ajuste #4 (2026-07-14): la tabla usa etiquetas cortas "Rol A"/"Rol B"
  // (el nombre completo solo vive en el Select de arriba), y admite un
  // tercer rol opcional "Rol C" -- generaliza el cálculo de diferencias a
  // los roles PRESENTES (2 o 3).
  test('"Comparativa": the table columns show short labels "Rol A"/"Rol B", not the full role name', async () => {
    render(<PermissionsMatrixScreen />)
    await goToTab('Comparativa')

    await selectOption(/^rol a$/i, 'Coordinador')
    await selectOption(/^rol b$/i, 'Supervisor')

    expect(await screen.findByRole('columnheader', { name: /^rol a$/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /^rol b$/i })).toBeInTheDocument()
    // El nombre completo del rol solo aparece en el Select de arriba, no
    // como encabezado de columna de la tabla.
    expect(screen.queryByRole('columnheader', { name: 'Coordinador' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Supervisor' })).not.toBeInTheDocument()
  })

  test('"Comparativa": "Rol C" defaults to "Ninguno" and the table keeps 2 data columns when it stays unselected (regression)', async () => {
    render(<PermissionsMatrixScreen />)
    await goToTab('Comparativa')

    expect(screen.getByRole('combobox', { name: /^rol c$/i })).toHaveTextContent('Ninguno')

    await selectOption(/^rol a$/i, 'Coordinador')
    await selectOption(/^rol b$/i, 'Supervisor')

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /^rol c$/i })).not.toBeInTheDocument()
    // Mismo resultado que antes de este cambio: 1 diferencia, 1 igual.
    expect(screen.getByText('1 diferencias')).toBeInTheDocument()
    expect(screen.getByText('1 iguales')).toBeInTheDocument()
  })

  test('"Comparativa": with Rol C selected, shows a 3rd data column and computes differences across the 3 roles', async () => {
    fetchRolesMock.mockResolvedValue(
      paginated([
        role({ id: 2, name: 'Coordinador', is_editable: true }),
        role({ id: 3, name: 'Supervisor', is_editable: true }),
        role({ id: 4, name: 'Auditor', is_editable: true }),
      ])
    )
    fetchRoleMock.mockImplementation((id: number) => {
      if (id === 2) {
        return Promise.resolve({
          role: role({ id: 2, name: 'Coordinador', permissions: [permission({ id: 1, name: 'Crear usuarios' })] }),
        })
      }
      if (id === 3) {
        return Promise.resolve({
          role: role({
            id: 3,
            name: 'Supervisor',
            permissions: [
              permission({ id: 1, name: 'Crear usuarios' }),
              permission({ id: 2, name: 'Eliminar usuarios', code: 'users.delete', action: 'delete' }),
            ],
          }),
        })
      }
      return Promise.resolve({
        role: role({ id: 4, name: 'Auditor', permissions: [permission({ id: 1, name: 'Crear usuarios' })] }),
      })
    })

    render(<PermissionsMatrixScreen />)
    await goToTab('Comparativa')

    await selectOption(/^rol a$/i, 'Coordinador')
    await selectOption(/^rol b$/i, 'Supervisor')
    await selectOption(/^rol c$/i, 'Auditor')

    expect(await screen.findByRole('columnheader', { name: /^rol c$/i })).toBeInTheDocument()

    // permission 1 ("Crear usuarios"): A=true, B=true, C=true -> Igual.
    // permission 2 ("Eliminar usuarios"): A=false, B=true, C=false -> Diferente.
    const matchRow = (await screen.findByText('Crear usuarios')).closest('tr')
    const diffRow = screen.getByText('Eliminar usuarios').closest('tr')
    expect(matchRow && within(matchRow).getByText('Igual')).toBeInTheDocument()
    expect(diffRow && within(diffRow).getByText('Diferente')).toBeInTheDocument()
    expect(screen.getByText('1 diferencias')).toBeInTheDocument()
    expect(screen.getByText('1 iguales')).toBeInTheDocument()
  })
})
