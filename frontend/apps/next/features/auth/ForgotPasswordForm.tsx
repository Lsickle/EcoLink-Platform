'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { RateLimitError, requestPasswordRecoveryCode } from 'app/features/auth/api'
import { requestRecoverySchema } from 'app/features/auth/schemas'
import { useRateLimitCountdown } from 'app/features/auth/useRateLimitCountdown'
import { savePasswordRecoveryEmail } from './passwordRecoveryStorage'

// CU-009.1 (POST /api/password/forgot): paso 0 del flujo de recuperación.
// RN-181: el backend responde SIEMPRE con el mismo mensaje genérico, exista
// o no la cuenta -- esta pantalla no infiere nada del resultado, solo
// redirige al paso siguiente. El correo NO viaja por query string (hallazgo
// especialista-seguridad, ver passwordRecoveryStorage.ts) -- se guarda en
// sessionStorage y ResetPasswordForm lo lee de ahí.
export function ForgotPasswordForm() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { secondsRemaining, isRateLimited, start: startRateLimitCountdown } = useRateLimitCountdown()
  const rateLimitMessage =
    secondsRemaining !== null ? `Demasiados intentos. Intenta de nuevo en ${secondsRemaining} segundos.` : null

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (isRateLimited) {
      return
    }

    const parsed = requestRecoverySchema.safeParse({ email })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.')
      return
    }

    setIsSubmitting(true)
    try {
      await requestPasswordRecoveryCode(parsed.data.email)
      savePasswordRecoveryEmail(parsed.data.email)
      router.push('/reset-password')
    } catch (err) {
      if (err instanceof RateLimitError) {
        startRateLimitCountdown(err.retryAfterSeconds)
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
        <CardTitle className="text-xl">Recupera tu contraseña</CardTitle>
        <CardDescription>Te enviaremos un código de verificación a tu correo</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="tu@empresa.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(error || rateLimitMessage)}
              aria-describedby={error || rateLimitMessage ? 'email-error' : undefined}
              autoFocus
            />
          </div>

          {(error || rateLimitMessage) && (
            <p id="email-error" className="text-sm text-destructive" role="alert" aria-live="polite">
              {rateLimitMessage ?? error}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting || isRateLimited} className="w-full">
            {isSubmitting ? 'Enviando…' : 'Enviar código'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            <a href="/login" className="underline underline-offset-4">
              Volver a iniciar sesión
            </a>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
