'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useRouter } from 'solito/navigation'
import { logout as apiLogout, me, type AuthUser } from '../../features/auth/api'

// Estado global de sesión (gap confirmado: hoy ninguna pantalla sabe si hay
// usuario logueado). Se hidrata llamando a GET /api/user (RN-181, cookie
// Sanctum en web) al montar. Vive en packages/app -- es lógica pura de
// React (sin JSX específico de RN ni del DOM), reutilizable cuando la app
// móvil tenga su propio login (aunque esa variante use token Bearer en vez
// de cookie, ver AuthController::login).
type AuthContextValue = {
  user: AuthUser | null
  isLoading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const { user } = await me()
      setUser(user)
    } catch {
      // Sin sesión activa (401) u otro error de red -- se trata igual como
      // "no logueado", no se distingue el motivo aquí.
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } finally {
      setUser(null)
    }
  }, [])

  return <AuthContext.Provider value={{ user, isLoading, refresh, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider.')
  }
  return context
}

export type RequireAuthResult = AuthContextValue & {
  /**
   * true solo cuando la sesión ya cargó, hay usuario, y (si se pidió
   * `requiredPermission`) el usuario lo tiene. Las pantallas deben esperar
   * a `isAuthorized` antes de renderizar contenido real -- mientras es
   * `false` puede ser por sesión todavía cargando, sin sesión (redirige a
   * /login), o sin el permiso (redirige a /).
   */
  isAuthorized: boolean
}

export type RequireAuthOptions = {
  /**
   * Hallazgo Alto (especialista-seguridad, 2026-07-14, revisión del
   * mecanismo de invitación): gate adicional para pantallas restringidas al
   * staff de la organización PLATAFORMA (`AuthUser.is_platform_staff`, ver
   * `AuthController::me()`/`User::isPlatformStaff()`). Se combina con
   * `requiredPermission` -- ambos deben cumplirse.
   */
  requirePlatformStaff?: boolean
}

/**
 * Para pantallas que exigen sesión activa (y, opcionalmente, un permiso
 * RBAC concreto y/o ser staff de la organización plataforma -- revisión de
 * seguridad del lote admin/*, defensa en profundidad ya que el backend
 * rechaza con 403 de todas formas): redirige a /login apenas se confirma que
 * no hay usuario, o a / si hay usuario pero le falta `requiredPermission` o
 * `requirePlatformStaff` (no antes, para no interrumpir mientras me()
 * todavía está en vuelo). Usa el router de solito para que la misma lógica
 * sirva en la futura app móvil.
 */
export function useRequireAuth(requiredPermission?: string, options?: RequireAuthOptions): RequireAuthResult {
  const auth = useAuth()
  const router = useRouter()
  const hasPermission = !requiredPermission || Boolean(auth.user?.permissions?.includes(requiredPermission))
  const hasPlatformStaff = !options?.requirePlatformStaff || Boolean(auth.user?.is_platform_staff)
  const isAllowed = hasPermission && hasPlatformStaff

  useEffect(() => {
    if (auth.isLoading) return
    if (!auth.user) {
      router.replace('/login')
      return
    }
    if (!isAllowed) {
      router.replace('/')
    }
  }, [auth.isLoading, auth.user, isAllowed, router])

  return {
    ...auth,
    isAuthorized: !auth.isLoading && Boolean(auth.user) && isAllowed,
  }
}
