'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { ApiValidationError, RateLimitError, login } from 'app/features/auth/api'
import { loginSchema } from 'app/features/auth/schemas'
import { useRateLimitCountdown } from 'app/features/auth/useRateLimitCountdown'
import { useAuth } from 'app/provider/auth'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const justRegistered = searchParams.get('registered') === '1'
  // CU-009.4/CU-009.5 (POST /api/password/reset): mismo patrón que
  // justRegistered -- ResetPasswordForm redirige aquí con ?reset=1 tras un
  // restablecimiento exitoso.
  const justReset = searchParams.get('reset') === '1'
  const { refresh } = useAuth()

  const [loginValue, setLoginValue] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Rate limiting de /api/login (RateLimiter::for('login', ...)): en vez de
  // un mensaje estático, se muestra una cuenta regresiva en vivo y se
  // deshabilita el submit hasta que termine.
  const { secondsRemaining, isRateLimited, start: startRateLimitCountdown } = useRateLimitCountdown()
  const rateLimitMessage =
    secondsRemaining !== null ? `Demasiados intentos. Intenta de nuevo en ${secondsRemaining} segundos.` : null

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (isRateLimited) {
      return
    }

    const parsed = loginSchema.safeParse({ login: loginValue, password })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.')
      return
    }

    setIsSubmitting(true)
    try {
      await login(parsed.data)
      await refresh()
      router.push('/')
    } catch (err) {
      if (err instanceof RateLimitError) {
        startRateLimitCountdown(err.retryAfterSeconds)
      } else if (err instanceof ApiValidationError) {
        setError(err.firstError('login') ?? err.message)
      } else {
        setError(err instanceof Error ? err.message : 'Error inesperado.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Bienvenido de nuevo</CardTitle>
        <CardDescription>Inicia sesión con tu correo y contraseña</CardDescription>
      </CardHeader>
      <CardContent>
        {justRegistered && (
          <p className="mb-4 rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground" role="status">
            Cuenta creada. Ya puedes iniciar sesión.
          </p>
        )}
        {justReset && (
          <p className="mb-4 rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground" role="status">
            Tu contraseña ha sido actualizada correctamente. Ya puedes iniciar sesión.
          </p>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login">Correo electrónico</Label>
            <Input
              id="login"
              type="email"
              autoComplete="username"
              placeholder="tu@empresa.com"
              value={loginValue}
              onChange={(event) => setLoginValue(event.target.value)}
              aria-invalid={Boolean(error)}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Contraseña</Label>
              <a href="/forgot-password" className="text-sm underline underline-offset-4">
                ¿Olvidaste tu contraseña?
              </a>
            </div>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(error || rateLimitMessage)}
              aria-describedby={error || rateLimitMessage ? 'login-error' : undefined}
            />
          </div>

          {(error || rateLimitMessage) && (
            <p id="login-error" className="text-sm text-destructive" role="alert" aria-live="polite">
              {rateLimitMessage ?? error}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting || isRateLimited} className="w-full">
            {isSubmitting ? 'Ingresando…' : 'Iniciar sesión'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            ¿No tienes cuenta?{' '}
            <a href="/register" className="underline underline-offset-4">
              Regístrate
            </a>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
