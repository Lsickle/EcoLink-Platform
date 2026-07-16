import type {
  AcceptInvitationFormValues,
  ChangePasswordFormValues,
  LoginFormValues,
  RequestInvitationFormValues,
  ResetPasswordFormValues,
} from './schemas'

// RN-181: Sanctum SPA (cookie de sesión). Todo request va con
// credentials: 'include' y el ciclo csrf-cookie -> X-XSRF-TOKEN que exige
// Sanctum (backend/config/cors.php, config/sanctum.php).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost'

export class ApiValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: Record<string, string[]>
  ) {
    super(message)
    this.name = 'ApiValidationError'
  }

  firstError(field: string): string | undefined {
    return this.errors[field]?.[0]
  }
}

// Rate limiting de /api/login y /api/register (RateLimiter::for('login'/'register')
// en backend/app/Providers/AppServiceProvider.php). Laravel responde 429 con
// mensaje en inglés y el header Retry-After (segundos) -- este error lo
// traduce y expone el segundero para que la UI pueda mostrar una cuenta
// regresiva en vez de un texto estático.
const DEFAULT_RETRY_AFTER_SECONDS = 60

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Demasiados intentos. Intenta de nuevo en ${retryAfterSeconds} segundos.`)
    this.name = 'RateLimitError'
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null
}

async function ensureCsrfCookie(): Promise<void> {
  await fetch(`${API_URL}/sanctum/csrf-cookie`, { credentials: 'include' })
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  await ensureCsrfCookie()
  const xsrfToken = readCookie('XSRF-TOKEN')

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(xsrfToken ? { 'X-XSRF-TOKEN': xsrfToken } : {}),
      ...options.headers,
    },
  })

  const body = await response.json().catch(() => null)

  if (response.status === 422 && body?.errors) {
    throw new ApiValidationError(body.message ?? 'Error de validación.', body.errors)
  }

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get('Retry-After')
    const retryAfterSeconds = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : NaN
    throw new RateLimitError(Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : DEFAULT_RETRY_AFTER_SECONDS)
  }

  if (!response.ok) {
    throw new Error(body?.message ?? `Error inesperado (${response.status}).`)
  }

  return body as T
}

// GET /api/user (AuthController::me) carga la relación `person` -- login y
// register solo devuelven los campos planos de `users` (ver
// AuthController::login/register, `$user->only([...])`), así que `person`
// solo llega poblado después de me().
export type AuthPerson = {
  first_name: string
  middle_name: string | null
  last_name: string
  second_last_name: string | null
  full_name: string
}

// RBAC (revisión de seguridad del lote admin/*): permisos efectivos del
// usuario -- unión plana de códigos (ej. "users.read") de todos sus roles
// activos. Solo llega poblado por GET /api/user (AuthController::me), igual
// que `person` -- login/register no lo incluyen. Base del gating de
// autorización en el frontend (sidebar + useRequireAuth), ver
// provider/auth/index.tsx. El backend sigue siendo la autoridad real (403
// por endpoint) -- esto es solo defensa en profundidad en la UI.
// Hallazgo Alto (especialista-seguridad, 2026-07-14, revisión del mecanismo
// de invitación): `is_platform_staff` (AuthController::me(), vía
// User::isPlatformStaff()) -- true solo si el tenant del usuario es la
// organización PLATAFORMA (organizations.is_platform_tenant=true). Base del
// gating de InvitationRequestsListScreen (defensa en profundidad, el backend
// ya rechaza con 403 -- ver InvitationRequestController).
export type AuthUser = {
  id: number
  uuid: string
  username: string
  email: string
  permissions?: string[]
  is_platform_staff?: boolean
  person?: AuthPerson
}

// CU-006.1 modificado (mecanismo de invitación, reemplaza el register()
// eliminado): solicitud pública sin contraseña, encolada PENDING para
// revisión de un administrador. RN-181: el backend SIEMPRE responde el
// mismo mensaje genérico de éxito (anti-enumeración) -- la UI no debe
// intentar inferir nada más allá de ese mensaje.
export async function requestInvitation(values: RequestInvitationFormValues): Promise<{ message: string }> {
  return apiFetch('/api/invitation-requests', {
    method: 'POST',
    body: JSON.stringify({
      document_type: values.documentType,
      document_number: values.documentNumber,
      first_name: values.firstName,
      last_name: values.lastName,
      email: values.email,
      phone: values.phone || undefined,
    }),
  })
}

// InvitationController::accept() -- público (sin auth:sanctum), fija la
// contraseña real y activa la cuenta (PENDING_ACTIVATION -> ACTIVE). Sin
// login automático: el caller redirige a /login por separado.
export async function acceptInvitation(values: AcceptInvitationFormValues): Promise<{ message: string }> {
  return apiFetch('/api/invitations/accept', {
    method: 'POST',
    body: JSON.stringify({
      token: values.token,
      password: values.password,
      password_confirmation: values.passwordConfirmation,
    }),
  })
}

export async function login(values: LoginFormValues): Promise<{ user: AuthUser }> {
  return apiFetch('/api/login', {
    method: 'POST',
    body: JSON.stringify({ login: values.login, password: values.password }),
  })
}

export async function logout(): Promise<void> {
  await apiFetch('/api/logout', { method: 'POST' })
}

export async function me(): Promise<{ user: AuthUser }> {
  return apiFetch('/api/user', { method: 'GET' })
}

export async function changePassword(values: ChangePasswordFormValues): Promise<{ message: string }> {
  return apiFetch('/api/password', {
    method: 'PUT',
    body: JSON.stringify({
      current_password: values.currentPassword,
      password: values.newPassword,
      password_confirmation: values.newPasswordConfirmation,
    }),
  })
}

// CU-009 (PasswordRecoveryController, backend/app/Http/Controllers/Api/
// PasswordRecoveryController.php): recuperación de contraseña por
// autoservicio, 3 endpoints públicos compartiendo el rate limiter
// `password-recovery` (mismo tratamiento de 429 que login/register, ver
// RateLimitError arriba).

// RN-181: forgot() SIEMPRE responde 200 con el mismo mensaje genérico,
// exista o no la cuenta -- la UI no debe intentar inferir nada del
// resultado más allá de ese mensaje (anti-enumeración).
export async function requestPasswordRecoveryCode(email: string): Promise<{ message: string }> {
  return apiFetch('/api/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

// CU-009.2: no consume el código de forma definitiva -- el backend lo
// revalida de nuevo en reset() (ver PasswordRecoveryController::reset(),
// no confía en un estado "ya verificado" del cliente).
export async function verifyPasswordRecoveryCode(email: string, code: string): Promise<{ verified: boolean }> {
  return apiFetch('/api/password/verify-code', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  })
}

export async function resetPassword(values: ResetPasswordFormValues): Promise<{ message: string }> {
  return apiFetch('/api/password/reset', {
    method: 'POST',
    body: JSON.stringify({
      email: values.email,
      code: values.code,
      password: values.password,
      password_confirmation: values.passwordConfirmation,
    }),
  })
}
