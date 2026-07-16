import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { RoleDetailScreen } from './RoleDetailScreen'

const fetchRoleMock = vi.fn()
const fetchUsersMock = vi.fn()
const fetchPermissionsMock = vi.fn()
const fetchRoleUsersMock = vi.fn()
const fetchRoleActivityMock = vi.fn()
const assignPermissionToRoleMock = vi.fn()
const revokePermissionFromRoleMock = vi.fn()
const assignRoleToUserMock = vi.fn()
const updateRoleMock = vi.fn()
const activateRoleMock = vi.fn()
const deactivateRoleMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchRole: (...args: unknown[]) => fetchRoleMock(...args),
    fetchUsers: (...args: unknown[]) => fetchUsersMock(...args),
    fetchPermissions: (...args: unknown[]) => fetchPermissionsMock(...args),
    fetchRoleUsers: (...args: unknown[]) => fetchRoleUsersMock(...args),
    fetchRoleActivity: (...args: unknown[]) => fetchRoleActivityMock(...args),
    assignPermissionToRole: (...args: unknown[]) => assignPermissionToRoleMock(...args),
    revokePermissionFromRole: (...args: unknown[]) => revokePermissionFromRoleMock(...args),
    assignRoleToUser: (...args: unknown[]) => assignRoleToUserMock(...args),
    updateRole: (...args: unknown[]) => updateRoleMock(...args),
    activateRole: (...args: unknown[]) => activateRoleMock(...args),
    deactivateRole: (...args: unknown[]) => deactivateRoleMock(...args),
  }
})

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function permission(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    code: 'users.create',
    name: 'Crear usuarios',
    module: 'users',
    action: 'create',
    scope: 'tenant',
    is_system: true,
    is_critical: false,
    is_active: true,
    ...overrides,
  }
}

function roleDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 3,
    uuid: 'r-3',
    code: 'COORDINADOR',
    name: 'Coordinador',
    description: 'desc',
    is_system: false,
    is_editable: true,
    priority_level: 3,
    is_active: true,
    tenant_organization_id: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-02',
    created_by: { id: 1, username: 'admin' },
    updated_by: { id: 1, username: 'admin' },
    users_count: 2,
    permissions_count: 1,
    risk_level: 'alto',
    permissions: [permission({ id: 1, name: 'Crear usuarios', module: 'users' })],
    ...overrides,
  }
}

function paginated<T>(data: T[]) {
  return { data, current_page: 1, last_page: 1, total: data.length, per_page: 15 }
}

// El badge "X/Y" de un módulo del accordion puede coincidir en texto con
// el badge "Permisos Asignados" del panel lateral "Resumen del Rol"
// cuando el catálogo tiene un solo módulo (fixture por defecto de este
// archivo) -- se acota la búsqueda al `<li>`/contenedor del accordion item
// correspondiente para no depender de cuál matchea primero.
function moduleAccordionItem(moduleCheckbox: HTMLElement): HTMLElement {
  const item = moduleCheckbox.closest('[data-slot="accordion-item"]')
  if (!item) throw new Error('No se encontró el accordion item del checkbox de módulo.')
  return item as HTMLElement
}

function adminUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 9,
    uuid: 'u-9',
    username: 'ana.gomez',
    email: 'ana@example.com',
    tenant_organization_id: 1,
    organization_id: null,
    person: {
      first_name: 'Ana',
      last_name: 'Gomez',
      middle_name: null,
      second_last_name: null,
      full_name: 'Ana Gomez',
      document_type: 'CC',
      document_number: '1',
      email: 'ana@example.com',
      phone: null,
    },
    status: { code: 'ACTIVE', name: 'Activo' },
    roles: [],
    ...overrides,
  }
}

describe('RoleDetailScreen', () => {
  beforeEach(() => {
    fetchRoleMock.mockResolvedValue({ role: roleDetail() })
    fetchPermissionsMock.mockResolvedValue({
      data: [permission({ id: 1, name: 'Crear usuarios', module: 'users' })],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 50,
    })
    fetchUsersMock.mockResolvedValue(paginated([adminUser()]))
    fetchRoleUsersMock.mockResolvedValue(paginated([adminUser()]))
    fetchRoleActivityMock.mockResolvedValue(
      paginated([
        {
          event_type: 'ROLE_UPDATED',
          description: "Rol 'COORDINADOR' modificado.",
          actor: { id: 1, username: 'admin' },
          created_at: '2026-07-14T00:00:00Z',
        },
      ])
    )
  })

  afterEach(() => {
    fetchRoleMock.mockReset()
    fetchUsersMock.mockReset()
    fetchPermissionsMock.mockReset()
    fetchRoleUsersMock.mockReset()
    fetchRoleActivityMock.mockReset()
    assignPermissionToRoleMock.mockReset()
    revokePermissionFromRoleMock.mockReset()
    assignRoleToUserMock.mockReset()
    updateRoleMock.mockReset()
    activateRoleMock.mockReset()
    deactivateRoleMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the roles.read permission via useRequireAuth', async () => {
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    expect(useRequireAuthMock).toHaveBeenCalledWith('roles.read')
  })

  test('does not fetch anything when the user lacks roles.read', () => {
    useRequireAuthMock.mockReturnValueOnce({ user: null, isLoading: false, isAuthorized: false })
    render(<RoleDetailScreen roleId={3} />)

    expect(fetchRoleMock).not.toHaveBeenCalled()
  })

  // Hallazgo menor de la revisión de seguridad: el módulo "audit" aparecía
  // sin traducir en pantalla.
  test('translates the "audit" module label to "Auditoría"', async () => {
    fetchRoleMock.mockResolvedValueOnce({ role: roleDetail({ permissions: [] }) })
    fetchPermissionsMock.mockResolvedValueOnce({
      data: [permission({ id: 5, name: 'Ver auditoría', module: 'audit' })],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 50,
    })
    render(<RoleDetailScreen roleId={3} />)

    // "Auditoría" también aparece como TabsTrigger (role="tab") -- se
    // busca puntualmente el header del accordion (role="button", chevron
    // nativo) para no depender de cuál de los dos matchea primero.
    expect(await screen.findByRole('button', { name: /auditoría/i })).toBeInTheDocument()
    expect(screen.queryByText('audit')).not.toBeInTheDocument()
  })

  test('shows the risk_level badge and permissions grouped by module', async () => {
    render(<RoleDetailScreen roleId={3} />)

    expect(await screen.findByText('Coordinador')).toBeInTheDocument()
    // "alto" aparece dos veces (badge del header + gauge "Nivel de Riesgo"
    // del panel lateral, ver rediseño lote 4) -- se verifican ambas.
    expect(screen.getAllByText('alto').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('button', { name: /usuarios/i })).toBeInTheDocument()
    // Los módulos vienen abiertos por defecto (catálogo pequeño, ver
    // comentario de RoleDetailScreen.tsx) -- el checkbox individual es
    // visible sin expandir el accordion primero.
    expect(screen.getByRole('checkbox', { name: 'Crear usuarios' })).toBeChecked()
  })

  test('highlights the current risk level segment in the gauge with a solid bar color (not the badge opacity class)', async () => {
    const { container } = render(<RoleDetailScreen roleId={3} />)

    expect(await screen.findByText('Coordinador')).toBeInTheDocument()

    // risk_level='alto' -> naranja. El segmento resaltado del gauge debe
    // usar la clase sólida (bg-orange-500), no la clase de badge con
    // opacidad reducida (bg-orange-500/15), que es casi indistinguible
    // del fondo bg-muted en una barra h-2.
    const solidSegment = container.querySelector('.h-2.flex-1.bg-orange-500')
    expect(solidSegment).not.toBeNull()

    const dimSegment = container.querySelector('.h-2.flex-1.bg-orange-500\\/15')
    expect(dimSegment).toBeNull()
  })

  test('checking an unassigned permission calls assignPermissionToRole with role_id', async () => {
    fetchRoleMock.mockResolvedValueOnce({
      role: roleDetail({
        permissions: [],
      }),
    })
    assignPermissionToRoleMock.mockResolvedValueOnce({ message: 'ok' })
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Crear usuarios' }))
    })

    expect(assignPermissionToRoleMock).toHaveBeenCalledWith(1, { role_id: 3 })
  })

  // Cierre de brecha con Figma (lote "Matriz de Permisos"): antes solo se
  // podía asignar (POST /revoke no existía) -- ahora el checkbox de un
  // permiso ya asignado sigue habilitado y desmarcarlo revoca.
  test('unchecking an already-assigned permission calls revokePermissionFromRole with role_id', async () => {
    revokePermissionFromRoleMock.mockResolvedValueOnce({ message: 'ok' })
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    const checkbox = screen.getByRole('checkbox', { name: 'Crear usuarios' })
    expect(checkbox).not.toHaveAttribute('aria-disabled', 'true')

    await act(async () => {
      fireEvent.click(checkbox)
    })

    expect(revokePermissionFromRoleMock).toHaveBeenCalledWith(1, 3)
  })

  test('shows a read-only notice for non-editable (system) roles', async () => {
    fetchRoleMock.mockResolvedValueOnce({ role: roleDetail({ is_editable: false, is_system: true }) })
    render(<RoleDetailScreen roleId={3} />)

    expect(await screen.findByText(/rol de sistema, no editable/i)).toBeInTheDocument()
  })

  test('assigning the role to a user calls assignRoleToUser with the selected user_id', async () => {
    assignRoleToUserMock.mockResolvedValueOnce({ message: 'ok' })
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    fireEvent.click(screen.getByRole('combobox', { name: /asignar a usuario/i }))
    const option = await screen.findByRole('option', { name: /ana gomez/i })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^asignar$/i }))
    })

    expect(assignRoleToUserMock).toHaveBeenCalledWith(3, { user_id: 9 })
    // Bug menor (mismo lote que el badge/botón de estado stale): el
    // trigger colapsado mostraba el user_id crudo ("9") en vez del nombre
    // completo tras seleccionar -- faltaba mapear value -> label.
    expect(screen.getByRole('combobox', { name: /asignar a usuario/i })).toHaveTextContent('Ana Gomez')
  })

  // Mismo bug que el reportado para los filtros Estado/Tipo de
  // RolesListScreen.tsx (Select sin `items` muestra el valor crudo, no la
  // etiqueta) -- aquí aplicado al selector "Nivel de Acceso" (rediseño lote
  // 4, ver Información General) de este formulario.
  test('shows the translated priority level label ("3. Coordinación"), not the raw value ("3")', async () => {
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    expect(screen.getByLabelText('Nivel de Acceso')).toHaveTextContent('3. Coordinación')
  })

  // Figma "Roles Management" (lote 3): edición inline de name/description/
  // priority_level -- mismo criterio is_editable ya aplicado al checklist
  // de permisos (ver comentario de desviación en RoleDetailScreen.tsx).
  test('the edit form is pre-filled with the role data and calls updateRole on submit', async () => {
    updateRoleMock.mockResolvedValueOnce({ role: { ...roleDetail(), name: 'Coordinador Senior' } })
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    expect(screen.getByLabelText('Nombre')).toHaveValue('Coordinador')
    expect(screen.getByLabelText('Descripción')).toHaveValue('desc')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Coordinador Senior' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(updateRoleMock).toHaveBeenCalledWith(3, {
      name: 'Coordinador Senior',
      description: 'desc',
      priority_level: 3,
    })
  })

  test('the edit form fields and save button are disabled for non-editable (system) roles', async () => {
    fetchRoleMock.mockResolvedValueOnce({ role: roleDetail({ is_editable: false, is_system: true }) })
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    expect(screen.getByLabelText('Nombre')).toBeDisabled()
    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeDisabled()
  })

  test('"Inactivar rol" calls deactivateRole and merges the response into the detail', async () => {
    deactivateRoleMock.mockResolvedValueOnce({ role: { ...roleDetail(), is_active: false } })
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /inactivar rol/i }))
    })

    expect(deactivateRoleMock).toHaveBeenCalledWith(3)
    // "Inactivo" aparece dos veces (badge del header + campo "Estado" de
    // Información General, ver rediseño lote 4) -- ambas deben reflejar el
    // nuevo estado.
    const inactivoBadges = await screen.findAllByText('Inactivo')
    expect(inactivoBadges.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('button', { name: /activar rol/i })).toBeInTheDocument()
  })

  test('"Activar rol" calls activateRole for an inactive role and updates the badge/button in place', async () => {
    fetchRoleMock.mockResolvedValueOnce({ role: roleDetail({ is_active: false }) })
    activateRoleMock.mockResolvedValueOnce({ role: { ...roleDetail(), is_active: true } })
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    expect(screen.getAllByText('Inactivo').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('button', { name: /activar rol/i })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /activar rol/i }))
    })

    expect(activateRoleMock).toHaveBeenCalledWith(3)
    // Bug reproducido en navegador: el badge/botón se quedaban en el valor
    // ANTERIOR hasta recargar la página -- estos asserts fallan si el
    // estado local no se actualiza con la respuesta del endpoint.
    const activoBadges = await screen.findAllByText('Activo')
    expect(activoBadges.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('button', { name: /inactivar rol/i })).toBeInTheDocument()
  })

  test('shows the toggle error and re-enables the button if deactivateRole fails (422)', async () => {
    deactivateRoleMock.mockRejectedValueOnce(
      new ApiValidationError('Error de validación.', {
        role: ['No se puede desactivar este rol: dejaría a la organización sin nadie con permiso para revertir la acción.'],
      })
    )
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /inactivar rol/i }))
    })

    expect(
      await screen.findByText('No se puede desactivar este rol: dejaría a la organización sin nadie con permiso para revertir la acción.')
    ).toBeInTheDocument()
    // El badge no cambia (el backend rechazó la acción) y el botón vuelve a
    // ser accionable -- no se queda colgado en estado de carga.
    expect(screen.getAllByText('Activo').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('button', { name: /inactivar rol/i })).not.toBeDisabled()
  })

  test('the activate/deactivate button is disabled for non-editable (system) roles', async () => {
    fetchRoleMock.mockResolvedValueOnce({ role: roleDetail({ is_editable: false, is_system: true }) })
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    expect(screen.getByRole('button', { name: /inactivar rol/i })).toBeDisabled()
  })

  // ---- Rediseño "Detalle de Rol" (lote 4, Figma) ---------------------------

  test('shows a "Protegido" badge for non-editable roles and the Sistema/Personalizado type badge', async () => {
    fetchRoleMock.mockResolvedValueOnce({ role: roleDetail({ is_editable: false, is_system: true }) })
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    expect(screen.getByText('Protegido')).toBeInTheDocument()
    expect(screen.getAllByText('Sistema').length).toBeGreaterThanOrEqual(1)
  })

  test('does not show the "Protegido" badge for editable (custom) roles', async () => {
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    expect(screen.queryByText('Protegido')).not.toBeInTheDocument()
    expect(screen.getAllByText('Personalizado').length).toBeGreaterThanOrEqual(1)
  })

  test('shows the contextual banner with permission/module/user counts derived from the loaded data', async () => {
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    // roleDetail() trae 1 permiso asignado (módulo "users", único módulo
    // del catálogo en este fixture) y users_count=2.
    const banner = screen.getByTestId('role-summary-banner')
    expect(banner).toHaveTextContent(/este rol tiene acceso a/i)
    expect(banner).toHaveTextContent('1')
    expect(banner).toHaveTextContent('1 de 1')
    expect(banner).toHaveTextContent('2')
  })

  test('shows Fecha de Creación/Creado Por/Última Actualización/Actualizado Por, "—" when the actor is null', async () => {
    fetchRoleMock.mockResolvedValueOnce({ role: roleDetail({ created_by: null, updated_by: null }) })
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    expect(screen.getByText('Creado Por')).toBeInTheDocument()
    expect(screen.getByText('Última Actualización')).toBeInTheDocument()
    expect(screen.getByText('Actualizado Por')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })

  test('shows created_by/updated_by usernames when present', async () => {
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    expect(screen.getAllByText('admin').length).toBeGreaterThanOrEqual(1)
  })

  // Accordion de permisos con checkbox tri-state por módulo (completo/
  // parcial/vacío).
  test('the per-module checkbox is aria-checked="mixed" when only some permissions of the module are assigned', async () => {
    fetchPermissionsMock.mockResolvedValueOnce(
      paginated([
        permission({ id: 1, name: 'Crear usuarios', module: 'users' }),
        permission({ id: 2, name: 'Editar usuarios', module: 'users' }),
      ])
    )
    fetchRoleMock.mockResolvedValueOnce({
      role: roleDetail({ permissions: [permission({ id: 1, name: 'Crear usuarios', module: 'users' })] }),
    })
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    const moduleCheckbox = screen.getByRole('checkbox', { name: /seleccionar todos los permisos de usuarios/i })
    expect(moduleCheckbox).toHaveAttribute('aria-checked', 'mixed')
    expect(within(moduleAccordionItem(moduleCheckbox)).getByText('1/2')).toBeInTheDocument()
  })

  test('the per-module checkbox is checked and disabled when every permission of the module is already assigned', async () => {
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    // roleDetail()/fetchPermissionsMock por defecto: 1 solo permiso en
    // "users", ya asignado -- módulo completo.
    const moduleCheckbox = screen.getByRole('checkbox', { name: /seleccionar todos los permisos de usuarios/i })
    expect(moduleCheckbox).toBeChecked()
    expect(moduleCheckbox).toHaveAttribute('aria-disabled', 'true')
    expect(within(moduleAccordionItem(moduleCheckbox)).getByText('1/1')).toBeInTheDocument()
  })

  test('the per-module checkbox is unchecked (not mixed) when no permission of the module is assigned', async () => {
    fetchRoleMock.mockResolvedValueOnce({ role: roleDetail({ permissions: [] }) })
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    const moduleCheckbox = screen.getByRole('checkbox', { name: /seleccionar todos los permisos de usuarios/i })
    expect(moduleCheckbox).toHaveAttribute('aria-checked', 'false')
    expect(within(moduleAccordionItem(moduleCheckbox)).getByText('0/1')).toBeInTheDocument()
  })

  test('clicking an unchecked/mixed module checkbox assigns every unassigned permission in that module (bulk, one POST per permission)', async () => {
    fetchPermissionsMock.mockResolvedValueOnce(
      paginated([
        permission({ id: 1, name: 'Crear usuarios', module: 'users' }),
        permission({ id: 2, name: 'Editar usuarios', module: 'users' }),
      ])
    )
    fetchRoleMock.mockResolvedValueOnce({ role: roleDetail({ permissions: [] }) })
    assignPermissionToRoleMock.mockResolvedValue({ message: 'ok' })
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    const moduleCheckbox = screen.getByRole('checkbox', { name: /seleccionar todos los permisos de usuarios/i })
    await act(async () => {
      fireEvent.click(moduleCheckbox)
    })

    expect(assignPermissionToRoleMock).toHaveBeenCalledWith(1, { role_id: 3 })
    expect(assignPermissionToRoleMock).toHaveBeenCalledWith(2, { role_id: 3 })
    expect(await within(moduleAccordionItem(moduleCheckbox)).findByText('2/2')).toBeInTheDocument()
  })

  test('the overall "% asignado" progress reflects assigned permissions over the full catalog', async () => {
    fetchPermissionsMock.mockResolvedValueOnce(
      paginated([
        permission({ id: 1, name: 'Crear usuarios', module: 'users' }),
        permission({ id: 2, name: 'Editar usuarios', module: 'users' }),
      ])
    )
    fetchRoleMock.mockResolvedValueOnce({
      role: roleDetail({ permissions: [permission({ id: 1, name: 'Crear usuarios', module: 'users' })] }),
    })
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    expect(screen.getByText('50% asignado')).toBeInTheDocument()
  })

  // Tab "Usuarios con este rol" (GET /admin/roles/{id}/users, nuevo lote 4).
  test('the "Usuarios" tab lazily fetches and displays the users assigned to this role', async () => {
    fetchRoleUsersMock.mockResolvedValueOnce(
      paginated([adminUser({ id: 20, username: 'jperez', person: { ...adminUser().person, full_name: 'Juan Perez' } })])
    )
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    expect(fetchRoleUsersMock).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /usuarios/i }))
    })

    expect(await screen.findByText('Juan Perez')).toBeInTheDocument()
    expect(fetchRoleUsersMock).toHaveBeenCalledWith(3, { perPage: 15 })
  })

  test('shows an error message if fetchRoleUsers fails', async () => {
    fetchRoleUsersMock.mockRejectedValueOnce(new Error('Error de red.'))
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /usuarios/i }))
    })

    expect(await screen.findByText('Error de red.')).toBeInTheDocument()
  })

  // Tab "Auditoría" (GET /admin/roles/{id}/activity, nuevo lote 4).
  test('the "Auditoría" tab lazily fetches and displays the activity timeline', async () => {
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    expect(fetchRoleActivityMock).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /auditoría/i }))
    })

    expect(await screen.findByText("Rol 'COORDINADOR' modificado.")).toBeInTheDocument()
    // "admin" también aparece en Creado Por/Actualizado Por/Última
    // Modificación -- se verifica puntualmente el renglón del evento
    // (fecha + actor concatenados en el mismo <p>, ver timeline).
    expect(screen.getByText(/· admin/)).toBeInTheDocument()
    expect(fetchRoleActivityMock).toHaveBeenCalledWith(3, { page: 1, perPage: 15 })
  })

  test('shows an error message if fetchRoleActivity fails', async () => {
    fetchRoleActivityMock.mockRejectedValueOnce(new Error('Error de red.'))
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /auditoría/i }))
    })

    expect(await screen.findByText('Error de red.')).toBeInTheDocument()
  })

  test('"Cargar más" fetches and appends the next page of activity events', async () => {
    fetchRoleActivityMock
      .mockResolvedValueOnce({
        data: [
          {
            event_type: 'ROLE_CREATED',
            description: "Rol 'COORDINADOR' creado.",
            actor: { id: 1, username: 'admin' },
            created_at: '2026-07-10T00:00:00Z',
          },
        ],
        current_page: 1,
        last_page: 2,
        total: 2,
        per_page: 1,
      })
      .mockResolvedValueOnce({
        data: [
          {
            event_type: 'ROLE_UPDATED',
            description: "Rol 'COORDINADOR' modificado.",
            actor: { id: 1, username: 'admin' },
            created_at: '2026-07-11T00:00:00Z',
          },
        ],
        current_page: 2,
        last_page: 2,
        total: 2,
        per_page: 1,
      })
    render(<RoleDetailScreen roleId={3} />)
    await screen.findByText('Coordinador')

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /auditoría/i }))
    })
    expect(await screen.findByText("Rol 'COORDINADOR' creado.")).toBeInTheDocument()
    // findByRole (no getByRole): entre el `.then` que puebla la lista y el
    // `.finally` que apaga `activityLoading` hay un microtask de por medio
    // -- el botón puede seguir en el label "Cargando…" un instante.
    const loadMoreButton = await screen.findByRole('button', { name: /cargar más/i })

    await act(async () => {
      fireEvent.click(loadMoreButton)
    })

    expect(await screen.findByText("Rol 'COORDINADOR' modificado.")).toBeInTheDocument()
    expect(fetchRoleActivityMock).toHaveBeenLastCalledWith(3, { page: 2, perPage: 15 })
  })
})
