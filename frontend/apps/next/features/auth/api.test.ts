import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  ApiValidationError,
  RateLimitError,
  acceptInvitation,
  changePassword,
  login,
  requestInvitation,
} from 'app/features/auth/api'

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('auth api client', () => {
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

  test('login fetches the csrf cookie first and sends X-XSRF-TOKEN', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({})) // /sanctum/csrf-cookie
      .mockResolvedValueOnce(jsonResponse({ user: { id: 1, uuid: 'u', username: 'ana', email: 'ana@example.com' } }))

    const result = await login({ login: 'ana@example.com', password: 'Passw0rd123' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]![0]).toContain('/sanctum/csrf-cookie')
    const [loginUrl, loginOptions] = fetchMock.mock.calls[1]!
    expect(loginUrl).toContain('/api/login')
    expect((loginOptions.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('test-token')
    expect(result.user.username).toBe('ana')
  })

  // CU-006.1 modificado: reemplaza al register() eliminado -- sin
  // username/password, POSTea a /api/invitation-requests.
  test('requestInvitation POSTs the identity fields without username/password', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({})) // csrf
      .mockResolvedValueOnce(jsonResponse({ message: 'Tu solicitud fue enviada. Un administrador la revisará.' }))

    const result = await requestInvitation({
      documentType: 'CC',
      documentNumber: '123',
      firstName: 'Ana',
      lastName: 'Gomez',
      email: 'ana@example.com',
      phone: '',
    })

    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toContain('/api/invitation-requests')
    const body = JSON.parse(options.body as string)
    expect(body).toEqual({
      document_type: 'CC',
      document_number: '123',
      first_name: 'Ana',
      last_name: 'Gomez',
      email: 'ana@example.com',
    })
    expect(body.username).toBeUndefined()
    expect(body.password).toBeUndefined()
    expect(result.message).toBe('Tu solicitud fue enviada. Un administrador la revisará.')
  })

  // InvitationController::accept() -- token + contraseña nueva, sin login
  // automático (el caller redirige a /login por separado).
  test('acceptInvitation POSTs token/password/password_confirmation', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({})) // csrf
      .mockResolvedValueOnce(jsonResponse({ message: 'Cuenta activada correctamente. Ya puedes iniciar sesión.' }))

    const result = await acceptInvitation({
      token: 'a-valid-token',
      password: 'Passw0rd123',
      passwordConfirmation: 'Passw0rd123',
    })

    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toContain('/api/invitations/accept')
    expect(JSON.parse(options.body as string)).toEqual({
      token: 'a-valid-token',
      password: 'Passw0rd123',
      password_confirmation: 'Passw0rd123',
    })
    expect(result.message).toBe('Cuenta activada correctamente. Ya puedes iniciar sesión.')
  })

  // Enlace inválido/expirado/ya usado -- InvitationController::accept()
  // siempre responde el mismo error genérico bajo el campo `token`
  // (anti-enumeración, mismo criterio que PasswordRecoveryController).
  test('acceptInvitation surfaces the generic token error as ApiValidationError', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse(
          { message: 'x', errors: { token: ['Enlace de invitación inválido o expirado.'] } },
          422
        )
      )

    const error = await acceptInvitation({
      token: 'expired-token',
      password: 'Passw0rd123',
      passwordConfirmation: 'Passw0rd123',
    }).catch((e) => e)

    expect(error).toBeInstanceOf(ApiValidationError)
    expect((error as ApiValidationError).firstError('token')).toBe('Enlace de invitación inválido o expirado.')
  })

  test('throws ApiValidationError with field errors on 422', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ message: 'Error de validación.', errors: { email: ['ya existe'] } }, 422))

    await expect(
      login({ login: 'ana@example.com', password: 'wrong' })
    ).rejects.toBeInstanceOf(ApiValidationError)
  })

  // PUT /api/password (AuthController::changePassword) -- protegido por
  // auth:sanctum, espera current_password/password/password_confirmation.
  test('changePassword sends a PUT with current_password/password/password_confirmation', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({})) // csrf
      .mockResolvedValueOnce(jsonResponse({ message: 'Contraseña actualizada.' }))

    const result = await changePassword({
      currentPassword: 'OldPassw0rd',
      newPassword: 'NewPassw0rd1',
      newPasswordConfirmation: 'NewPassw0rd1',
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [url, options] = fetchMock.mock.calls[1]!
    expect(url).toContain('/api/password')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body as string)).toEqual({
      current_password: 'OldPassw0rd',
      password: 'NewPassw0rd1',
      password_confirmation: 'NewPassw0rd1',
    })
    expect(result.message).toBe('Contraseña actualizada.')
  })

  test('changePassword surfaces ApiValidationError when the current password is wrong', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({ message: 'x', errors: { current_password: ['La contraseña actual no es correcta.'] } }, 422)
      )

    await expect(
      changePassword({ currentPassword: 'wrong', newPassword: 'NewPassw0rd1', newPasswordConfirmation: 'NewPassw0rd1' })
    ).rejects.toBeInstanceOf(ApiValidationError)
  })

  // RN-181 / rate limiting de /api/login (RateLimiter::for('login', ...) en
  // AppServiceProvider): 429 con header Retry-After -- se traduce a un
  // RateLimitError en español con la cuenta regresiva en segundos.
  test('throws RateLimitError with retryAfterSeconds parsed from the Retry-After header on 429', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({ message: 'Too Many Attempts.' }, 429, { 'Retry-After': '45' })
      )

    const error = await login({ login: 'ana@example.com', password: 'wrong' }).catch((e) => e)

    expect(error).toBeInstanceOf(RateLimitError)
    expect((error as InstanceType<typeof RateLimitError>).retryAfterSeconds).toBe(45)
    expect((error as Error).message).toBe('Demasiados intentos. Intenta de nuevo en 45 segundos.')
  })

  test('RateLimitError falls back to 60 seconds when the Retry-After header is missing', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ message: 'Too Many Attempts.' }, 429))

    const error = await login({ login: 'ana@example.com', password: 'wrong' }).catch((e) => e)

    expect(error).toBeInstanceOf(RateLimitError)
    expect((error as InstanceType<typeof RateLimitError>).retryAfterSeconds).toBe(60)
    expect((error as Error).message).toBe('Demasiados intentos. Intenta de nuevo en 60 segundos.')
  })
})
