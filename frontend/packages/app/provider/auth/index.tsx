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

/**
 * Para pantallas que exigen sesión activa: redirige a /login apenas se
 * confirma que no hay usuario (no antes, para no interrumpir mientras
 * me() todavía está en vuelo). Usa el router de solito para que la misma
 * lógica sirva en la futura app móvil.
 */
export function useRequireAuth(): AuthContextValue {
  const auth = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!auth.isLoading && !auth.user) {
      router.replace('/login')
    }
  }, [auth.isLoading, auth.user, router])

  return auth
}
