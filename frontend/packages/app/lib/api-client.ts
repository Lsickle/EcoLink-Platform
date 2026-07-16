// Cliente HTTP compartido -- extraído de features/auth/api.ts (mismo patrón
// RN-181 de Sanctum SPA: cookie de sesión + ciclo CSRF antes de cualquier
// request autenticado, header X-XSRF-TOKEN leído de la cookie). Los módulos
// de admin (usuarios/roles/permisos) reutilizan este cliente en vez de
// duplicar el ciclo CSRF -- features/auth/api.ts mantiene su propia copia
// para no arriesgar sus tests ya cerrados, ver nota en el resumen del
// agente frontend-web.
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

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  await ensureCsrfCookie()
  const xsrfToken = readCookie('XSRF-TOKEN')

  // Import CSV (waste-streams/un-codes) manda `body: FormData` -- el
  // navegador debe fijar su propio `Content-Type: multipart/form-data;
  // boundary=...`, nunca `application/json` (rompería el parseo del
  // archivo en el backend). Detectado por tipo de `body`, no por un flag
  // explícito, para no tener que tocar cada caller existente.
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
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
