import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  ApiValidationError,
  activateBranchType,
  activateCountry,
  activateDepartment,
  activateLocality,
  activateMunicipality,
  activateRole,
  activateUser,
  approveInvitationRequest,
  assignPermissionToRole,
  assignRoleToUser,
  createBranchType,
  createRole,
  createUser,
  deactivateBranchType,
  deactivateCountry,
  deactivateDepartment,
  deactivateLocality,
  deactivateMunicipality,
  deactivateRole,
  deactivateUser,
  deleteRole,
  fetchBranchType,
  fetchBranchTypes,
  fetchCountries,
  fetchDepartments,
  fetchInvitationRequests,
  fetchLocalities,
  fetchMunicipalities,
  fetchPermission,
  fetchPermissionActivity,
  fetchPermissionMatrixByModule,
  fetchPermissionRoles,
  fetchPermissionUsers,
  fetchPermissions,
  fetchRole,
  fetchRoleActivity,
  fetchRoleUsers,
  fetchRoles,
  fetchUser,
  fetchUserActivity,
  fetchUsers,
  rejectInvitationRequest,
  resendInvitation,
  resetUserPassword,
  revokePermissionFromRole,
  revokeRoleFromUser,
  updateBranchType,
  updateRole,
  updateUser,
} from 'app/features/admin/api'

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: body === null ? headers : { 'Content-Type': 'application/json', ...headers },
  })
}

describe('admin api client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    document.cookie = 'XSRF-TOKEN=test-token'
  })

  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllGlobals()
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 UTC'
  })

  test('fetchUsers requests the paginated collection with per_page', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({})) // csrf
      .mockResolvedValueOnce(jsonResponse({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }))

    await fetchUsers({ perPage: 15 })

    const [url] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/users?per_page=15')
  })

  // Cierre de brecha con Figma (lote 2026-07-14): search/status/role/sort/
  // direction, paridad EXACTA con fetchRoles().
  test('fetchUsers forwards search/status/role/sort/direction as query params', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }))

    await fetchUsers({
      page: 2,
      perPage: 10,
      search: 'ana',
      status: 'ACTIVE',
      role: 'ADMINISTRADOR',
      sort: 'created_at',
      direction: 'desc',
    })

    const [url] = fetchMock.mock.calls[1]!
    expect(url).toBe(
      'http://localhost/api/admin/users?page=2&per_page=10&search=ana&status=ACTIVE&role=ADMINISTRADOR&sort=created_at&direction=desc'
    )
  })

  // Mecanismo de invitación (CU-006.1 modificado): store() ya no acepta
  // password/password_confirmation -- dispara invitación por correo.
  test('createUser POSTs the payload as JSON without password fields', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ user: { id: 1 } }, 201))

    const payload = {
      first_name: 'Ana',
      last_name: 'Gomez',
      document_type: 'CC',
      document_number: '123',
      username: 'ana',
      email: 'ana@example.com',
      role_ids: [1, 2],
    }

    await createUser(payload)

    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/users')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body as string)).toEqual(payload)
  })

  // Reenvío de invitación (nuevo en este lote): sin body, 422 si el usuario
  // ya está ACTIVE.
  test('resendInvitation POSTs to the resend-invitation endpoint with no body', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ message: 'Invitación reenviada.' }))

    const result = await resendInvitation(7)

    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/users/7/resend-invitation')
    expect(options.method).toBe('POST')
    expect(options.body).toBeUndefined()
    expect(result.message).toBe('Invitación reenviada.')
  })

  test('resendInvitation surfaces a 422 when the user is already ACTIVE', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(
      jsonResponse(
        { message: 'x', errors: { user: ['El usuario ya está activo -- no hay ninguna invitación pendiente que reenviar.'] } },
        422
      )
    )

    const error = await resendInvitation(7).catch((e) => e)

    expect(error).toBeInstanceOf(ApiValidationError)
  })

  test('fetchUser gets a single user by id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(jsonResponse({ user: { id: 7 } }))

    await fetchUser(7)

    expect(fetchMock.mock.calls[1]![0]).toBe('http://localhost/api/admin/users/7')
  })

  test('updateUser sends a partial PUT payload', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(jsonResponse({ user: { id: 7 } }))

    await updateUser(7, { email: 'nuevo@example.com' })

    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/users/7')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body as string)).toEqual({ email: 'nuevo@example.com' })
  })

  test('activateUser POSTs to the activate endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(jsonResponse({ user: { id: 7 } }))

    await activateUser(7)

    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/users/7/activate')
    expect(options.method).toBe('POST')
  })

  // Guarda real de seguridad (RBAC): no se puede desactivar al último admin
  // activo de la organización -- el mensaje del backend se propaga tal cual
  // vía ApiValidationError, la UI no debe reinterpretarlo.
  test('deactivateUser surfaces the "last active admin" guard as ApiValidationError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(
      jsonResponse(
        {
          message: 'No se puede procesar la solicitud.',
          errors: {
            user: ['No se puede desactivar: dejaría a la organización sin ningún administrador activo.'],
          },
        },
        422
      )
    )

    const error = await deactivateUser(7).catch((e) => e)

    expect(error).toBeInstanceOf(ApiValidationError)
    expect((error as ApiValidationError).firstError('user')).toBe(
      'No se puede desactivar: dejaría a la organización sin ningún administrador activo.'
    )
  })

  test('fetchRoles requests the paginated collection', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }))

    await fetchRoles()

    expect(fetchMock.mock.calls[1]![0]).toBe('http://localhost/api/admin/roles')
  })

  // Figma "Roles Management" (lote 3): search/status/type/sort/direction --
  // ver whitelist real en RoleController::index().
  test('fetchRoles forwards search/status/type/sort/direction as query params', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 10 }))

    await fetchRoles({
      page: 2,
      perPage: 10,
      search: 'coord',
      status: 'active',
      type: 'custom',
      sort: 'created_at',
      direction: 'desc',
    })

    const [url] = fetchMock.mock.calls[1]!
    expect(url).toBe(
      'http://localhost/api/admin/roles?page=2&per_page=10&search=coord&status=active&type=custom&sort=created_at&direction=desc'
    )
  })

  test('activateRole POSTs to the activate endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(jsonResponse({ role: { id: 3 } }))

    await activateRole(3)

    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/roles/3/activate')
    expect(options.method).toBe('POST')
  })

  test('deactivateRole POSTs to the deactivate endpoint and surfaces the is_editable guard', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(
      jsonResponse({ message: 'x', errors: { role: ['Este rol es de sistema y no puede modificarse.'] } }, 422)
    )

    const error = await deactivateRole(3).catch((e) => e)

    expect(error).toBeInstanceOf(ApiValidationError)
    expect((error as ApiValidationError).firstError('role')).toBe('Este rol es de sistema y no puede modificarse.')
  })

  test('createRole POSTs only code/name/description/priority_level', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(jsonResponse({ role: { id: 3 } }, 201))

    await createRole({ code: 'COORD_LOGISTICA', name: 'Coordinador de logística', priority_level: 3 })

    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/roles')
    expect(JSON.parse(options.body as string)).toEqual({
      code: 'COORD_LOGISTICA',
      name: 'Coordinador de logística',
      priority_level: 3,
    })
  })

  test('fetchRole returns risk_level and permissions from show', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(
      jsonResponse({ role: { id: 3, risk_level: 'alto', permissions: [{ id: 1 }] } })
    )

    const { role } = await fetchRole(3)

    expect(fetchMock.mock.calls[1]![0]).toBe('http://localhost/api/admin/roles/3')
    expect(role.risk_level).toBe('alto')
    expect(role.permissions).toEqual([{ id: 1 }])
  })

  test('updateRole sends a partial PUT payload', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(jsonResponse({ role: { id: 3 } }))

    await updateRole(3, { name: 'Nuevo nombre' })

    const [, options] = fetchMock.mock.calls[1]!
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body as string)).toEqual({ name: 'Nuevo nombre' })
  })

  test('deleteRole sends a DELETE request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(jsonResponse(null, 204))

    await deleteRole(3)

    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/roles/3')
    expect(options.method).toBe('DELETE')
  })

  test('assignRoleToUser POSTs user_id to the assign endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(jsonResponse({ message: 'ok' }))

    await assignRoleToUser(3, { user_id: 9 })

    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/roles/3/assign')
    expect(JSON.parse(options.body as string)).toEqual({ user_id: 9 })
  })

  // Figma "Detalle de Rol" (lote 4) -- tab "Usuarios con este rol".
  test('fetchRoleUsers requests the paginated users-for-role endpoint', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }))

    await fetchRoleUsers(3, { page: 2, perPage: 15 })

    const [url] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/roles/3/users?page=2&per_page=15')
  })

  test('fetchRoleUsers omits query params when not provided', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }))

    await fetchRoleUsers(3)

    expect(fetchMock.mock.calls[1]![0]).toBe('http://localhost/api/admin/roles/3/users')
  })

  // Figma "Detalle de Rol" (lote 4) -- tab "Actividad".
  test('fetchRoleActivity requests the paginated activity endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            event_type: 'ROLE_UPDATED',
            description: "Rol 'COORDINADOR' modificado.",
            actor: { id: 1, username: 'admin' },
            created_at: '2026-07-14T00:00:00Z',
          },
        ],
        current_page: 1,
        last_page: 1,
        total: 1,
        per_page: 15,
      })
    )

    const result = await fetchRoleActivity(3, { page: 1, perPage: 15 })

    const [url] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/roles/3/activity?page=1&per_page=15')
    expect(result.data[0]!.event_type).toBe('ROLE_UPDATED')
  })

  test('fetchPermissions defaults per_page to 50', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 50 }))

    await fetchPermissions()

    expect(fetchMock.mock.calls[1]![0]).toBe('http://localhost/api/admin/permissions?per_page=50')
  })

  // Cierre de brecha con Figma (lote "Matriz de Permisos"/"Detalle de
  // Permiso"): search/module/status/critical/sort/direction, paridad con
  // fetchRoles()/fetchUsers().
  test('fetchPermissions forwards search/module/status/critical/sort/direction as query params', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 10 }))

    await fetchPermissions({
      page: 2,
      perPage: 10,
      search: 'crear',
      module: 'users',
      status: 'active',
      critical: true,
      sort: 'code',
      direction: 'asc',
    })

    const [url] = fetchMock.mock.calls[1]!
    expect(url).toBe(
      'http://localhost/api/admin/permissions?page=2&per_page=10&search=crear&module=users&status=active&critical=true&sort=code&direction=asc'
    )
  })

  test('assignPermissionToRole POSTs role_id to the assign endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(jsonResponse({ message: 'ok' }))

    await assignPermissionToRole(5, { role_id: 3 })

    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/permissions/5/assign')
    expect(JSON.parse(options.body as string)).toEqual({ role_id: 3 })
  })

  test('revokePermissionFromRole POSTs role_id to the revoke endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(jsonResponse({ message: 'ok' }))

    await revokePermissionFromRole(5, 3)

    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/permissions/5/revoke')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body as string)).toEqual({ role_id: 3 })
  })

  test('fetchPermission gets a single permission by id', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ permission: { id: 5, roles_count: 2, users_impacted_count: 4 } }))

    const { permission } = await fetchPermission(5)

    expect(fetchMock.mock.calls[1]![0]).toBe('http://localhost/api/admin/permissions/5')
    expect(permission.roles_count).toBe(2)
    expect(permission.users_impacted_count).toBe(4)
  })

  test('fetchPermissionRoles requests the paginated roles-for-permission endpoint', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }))

    await fetchPermissionRoles(5, { page: 1, perPage: 15 })

    const [url] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/permissions/5/roles?page=1&per_page=15')
  })

  test('fetchPermissionUsers requests the paginated users-for-permission endpoint', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }))

    await fetchPermissionUsers(5, { page: 1, perPage: 15 })

    const [url] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/permissions/5/users?page=1&per_page=15')
  })

  test('fetchPermissionActivity requests the paginated activity endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            event_type: 'PERMISSION_ASSIGNED',
            description: "Permiso 'Crear usuarios' asignado al rol 'Coordinador'.",
            actor: { id: 1, username: 'admin' },
            created_at: '2026-07-14T00:00:00Z',
          },
        ],
        current_page: 1,
        last_page: 1,
        total: 1,
        per_page: 15,
      })
    )

    const result = await fetchPermissionActivity(5, { page: 1, perPage: 15 })

    const [url] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/permissions/5/activity?page=1&per_page=15')
    expect(result.data[0]!.event_type).toBe('PERMISSION_ASSIGNED')
  })

  test('fetchPermissionMatrixByModule requests the matrix-by-module endpoint with the module filter', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ module: 'users', permissions: [], roles: [], assignments: {} }))

    await fetchPermissionMatrixByModule('users')

    expect(fetchMock.mock.calls[1]![0]).toBe('http://localhost/api/admin/permissions/matrix-by-module?module=users')
  })

  // Solicitudes de invitación (CU-006.1 modificado, reemplaza el registro
  // público): fetchInvitationRequests/approve/reject.
  test('fetchInvitationRequests requests the paginated collection filtered by status', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }))

    await fetchInvitationRequests({ status: 'PENDING', page: 1 })

    const [url] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/invitation-requests?status=PENDING&page=1')
  })

  test('fetchInvitationRequests omits the status param when not provided', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }))

    await fetchInvitationRequests({})

    expect(fetchMock.mock.calls[1]![0]).toBe('http://localhost/api/admin/invitation-requests')
  })

  test('approveInvitationRequest POSTs role_ids to the approve endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(
      jsonResponse({ user: { id: 9 }, invitation_request: { id: 3, status: 'APPROVED' } }, 201)
    )

    await approveInvitationRequest(3, { role_ids: [1, 2] })

    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/invitation-requests/3/approve')
    expect(JSON.parse(options.body as string)).toEqual({ role_ids: [1, 2] })
  })

  test('approveInvitationRequest surfaces validation errors (e.g. already reviewed)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(
      jsonResponse({ message: 'x', errors: { invitation_request: ['Esta solicitud ya fue revisada.'] } }, 422)
    )

    const error = await approveInvitationRequest(3, { role_ids: [1] }).catch((e) => e)

    expect(error).toBeInstanceOf(ApiValidationError)
    expect((error as ApiValidationError).firstError('invitation_request')).toBe('Esta solicitud ya fue revisada.')
  })

  test('rejectInvitationRequest POSTs the optional reason to the reject endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(
      jsonResponse({ invitation_request: { id: 3, status: 'REJECTED' } })
    )

    await rejectInvitationRequest(3, { reason: 'Documentación insuficiente.' })

    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/invitation-requests/3/reject')
    expect(JSON.parse(options.body as string)).toEqual({ reason: 'Documentación insuficiente.' })
  })

  test('rejectInvitationRequest defaults to an empty body when no reason is given', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(
      jsonResponse({ invitation_request: { id: 3, status: 'REJECTED' } })
    )

    await rejectInvitationRequest(3)

    const [, options] = fetchMock.mock.calls[1]!
    expect(JSON.parse(options.body as string)).toEqual({})
  })

  // Cierre de brecha con Figma (lote 2026-07-14) -- revokeRoleFromUser/
  // resetUserPassword/fetchUserActivity, nuevos endpoints del lote.
  test('revokeRoleFromUser POSTs to the revoke endpoint with no body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(jsonResponse({ message: 'Rol revocado.' }))

    const result = await revokeRoleFromUser(7, 3)

    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/users/7/roles/3/revoke')
    expect(options.method).toBe('POST')
    expect(options.body).toBeUndefined()
    expect(result.message).toBe('Rol revocado.')
  })

  // RN-027: no se puede revocar la última asignación activa -- el mensaje
  // del backend se propaga tal cual, sin reinterpretarlo.
  test('revokeRoleFromUser surfaces the "last active role" guard as ApiValidationError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(
      jsonResponse(
        { message: 'x', errors: { role: ['No se puede revocar: el usuario debe conservar al menos un rol activo.'] } },
        422
      )
    )

    const error = await revokeRoleFromUser(7, 3).catch((e) => e)

    expect(error).toBeInstanceOf(ApiValidationError)
    expect((error as ApiValidationError).firstError('role')).toBe(
      'No se puede revocar: el usuario debe conservar al menos un rol activo.'
    )
  })

  test('resetUserPassword POSTs to the reset-password endpoint with no body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(
      jsonResponse({ message: 'Se envió un código de verificación al correo del usuario para restablecer su contraseña.' })
    )

    const result = await resetUserPassword(7)

    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/users/7/reset-password')
    expect(options.method).toBe('POST')
    expect(options.body).toBeUndefined()
    expect(result.message).toBe('Se envió un código de verificación al correo del usuario para restablecer su contraseña.')
  })

  test('fetchUserActivity requests the paginated activity endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            event_type: 'USER_ACTIVATED',
            description: "Usuario 'ana.gomez' activado por administrador.",
            actor: { id: 1, username: 'admin' },
            created_at: '2026-07-14T00:00:00Z',
          },
        ],
        current_page: 1,
        last_page: 1,
        total: 1,
        per_page: 15,
      })
    )

    const result = await fetchUserActivity(7, { page: 1, perPage: 15 })

    const [url] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/users/7/activity?page=1&per_page=15')
    expect(result.data[0]!.event_type).toBe('USER_ACTIVATED')
  })

  // ---- Catálogos Maestros: geografía en cascada (D-P01) -------------------

  test('fetchCountries requests the paginated collection with search/status', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }))

    await fetchCountries({ search: 'colo', status: 'active' })

    const [url] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/countries?search=colo&status=active')
  })

  test('activateCountry/deactivateCountry POST to their respective endpoints', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ country: { id: 1, is_active: true } }))
    await activateCountry(1)
    expect(fetchMock.mock.calls[1]![0]).toBe('http://localhost/api/admin/countries/1/activate')
    expect(fetchMock.mock.calls[1]![1].method).toBe('POST')

    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ country: { id: 1, is_active: false } }))
    await deactivateCountry(1)
    expect(fetchMock.mock.calls[3]![0]).toBe('http://localhost/api/admin/countries/1/deactivate')
  })

  test('fetchDepartments forwards countryId as the country_id query param', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }))

    await fetchDepartments({ countryId: 3 })

    const [url] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/departments?country_id=3')
  })

  test('activateDepartment/deactivateDepartment POST to their respective endpoints', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ department: { id: 1, is_active: true } }))
    await activateDepartment(1)
    expect(fetchMock.mock.calls[1]![0]).toBe('http://localhost/api/admin/departments/1/activate')

    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ department: { id: 1, is_active: false } }))
    await deactivateDepartment(1)
    expect(fetchMock.mock.calls[3]![0]).toBe('http://localhost/api/admin/departments/1/deactivate')
  })

  test('fetchMunicipalities forwards departmentId as the department_id query param', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }))

    await fetchMunicipalities({ departmentId: 5, page: 2, perPage: 25 })

    const [url] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/municipalities?page=2&per_page=25&department_id=5')
  })

  test('activateMunicipality/deactivateMunicipality POST to their respective endpoints', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ municipality: { id: 1, is_active: true } }))
    await activateMunicipality(1)
    expect(fetchMock.mock.calls[1]![0]).toBe('http://localhost/api/admin/municipalities/1/activate')

    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ municipality: { id: 1, is_active: false } }))
    await deactivateMunicipality(1)
    expect(fetchMock.mock.calls[3]![0]).toBe('http://localhost/api/admin/municipalities/1/deactivate')
  })

  test('fetchLocalities forwards municipalityId as the municipality_id query param', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }))

    await fetchLocalities({ municipalityId: 11001 })

    const [url] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/localities?municipality_id=11001')
  })

  test('activateLocality/deactivateLocality POST to their respective endpoints', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ locality: { id: 1, is_active: true } }))
    await activateLocality(1)
    expect(fetchMock.mock.calls[1]![0]).toBe('http://localhost/api/admin/localities/1/activate')

    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ locality: { id: 1, is_active: false } }))
    await deactivateLocality(1)
    expect(fetchMock.mock.calls[3]![0]).toBe('http://localhost/api/admin/localities/1/deactivate')
  })

  // ---- Tipos de Sede (/api/admin/branch-types) -----------------------------

  test('fetchBranchTypes requests the paginated collection', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }))

    await fetchBranchTypes({ search: 'planta', status: 'active' })

    const [url] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/branch-types?search=planta&status=active')
  })

  test('createBranchType POSTs the payload as JSON', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ branch_type: { id: 1, code: 'PLT' } }, 201))

    const payload = {
      code: 'PLT',
      name: 'Planta',
      category: 'Productiva',
      is_logistics: false,
      is_storage: false,
      is_treatment: true,
      is_dispatch: false,
    }
    const result = await createBranchType(payload)

    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/branch-types')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body as string)).toEqual(payload)
    expect(result.branch_type.id).toBe(1)
  })

  test('fetchBranchType gets a single branch type by id', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ branch_type: { id: 4, code: 'LAB' } }))

    const result = await fetchBranchType(4)

    expect(fetchMock.mock.calls[1]![0]).toBe('http://localhost/api/admin/branch-types/4')
    expect(result.branch_type.code).toBe('LAB')
  })

  test('updateBranchType sends a partial PUT payload', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ branch_type: { id: 4, name: 'Laboratorio Central' } }))

    await updateBranchType(4, { name: 'Laboratorio Central' })

    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toBe('http://localhost/api/admin/branch-types/4')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body as string)).toEqual({ name: 'Laboratorio Central' })
  })

  test('activateBranchType/deactivateBranchType POST to their respective endpoints', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ branch_type: { id: 1, is_active: true } }))
    await activateBranchType(1)
    expect(fetchMock.mock.calls[1]![0]).toBe('http://localhost/api/admin/branch-types/1/activate')

    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ branch_type: { id: 1, is_active: false } }))
    await deactivateBranchType(1)
    expect(fetchMock.mock.calls[3]![0]).toBe('http://localhost/api/admin/branch-types/1/deactivate')
  })
})
