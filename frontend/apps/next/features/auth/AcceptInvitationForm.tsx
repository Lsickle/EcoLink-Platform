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
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { PasswordStrengthMeter } from '@/components/ui/password-strength-meter'
import { ApiValidationError, RateLimitError, acceptInvitation } from 'app/features/auth/api'
import { acceptInvitationSchema } from 'app/features/auth/schemas'
import { useRateLimitCountdown } from 'app/features/auth/useRateLimitCountdown'

type FieldErrors = Partial<Record<'password' | 'passwordConfirmation', string>>

// InvitationController::accept() (CU-006.1 modificado, mecanismo de
// invitación): el token viaja por query string (?token=...) del link del
// correo -- a diferencia de ResetPasswordForm (que nunca pasa el email por
// query string por PII), aquí el token SÍ va en la URL: es la prueba de
// invitación en sí, mismo patrón universal de links de invitación. Sin
// login automático tras aceptar -- redirige a /login por separado.
export function AcceptInvitationForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Rate limiting de /api/invitations/accept
  // (RateLimiter::for('invitation-accept', ...)): mismo patrón de cuenta
  // regresiva en vivo que el resto de pantallas de auth.
  const { secondsRemaining, isRateLimited, start: startRateLimitCountdown } = useRateLimitCountdown()
  const rateLimitMessage =
    secondsRemaining !== null ? `Demasiados intentos. Intenta de nuevo en ${secondsRemaining} segundos.` : null

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    if (isRateLimited) {
      return
    }

    const parsed = acceptInvitationSchema.safeParse({ token, password, passwordConfirmation })
    if (!parsed.success) {
      const errors: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors
        if (key === 'password' || key === 'passwordConfirmation') {
          errors[key] ??= issue.message
        } else {
          setFormError(issue.message)
        }
      }
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)
    try {
      await acceptInvitation(parsed.data)
      router.push('/login?invitationAccepted=1')
    } catch (error) {
      if (error instanceof RateLimitError) {
        startRateLimitCountdown(error.retryAfterSeconds)
      } else if (error instanceof ApiValidationError) {
        // El backend siempre responde el mismo error genérico bajo `token`
        // (anti-enumeración, ver InvitationController::accept()) -- no se
        // distingue "expiró" de "ya se usó" de "nunca existió".
        setFormError(error.firstError('token') ?? error.firstError('password') ?? error.message)
      } else {
        setFormError(error instanceof Error ? error.message : 'Error inesperado.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!token) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Enlace de invitación inválido</CardTitle>
          <CardDescription>
            Este enlace no incluye un token de invitación válido. Revisa el correo que recibiste o contacta a un
            administrador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            <a href="/login" className="underline underline-offset-4">
              Volver a iniciar sesión
            </a>
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Activa tu cuenta</CardTitle>
        <CardDescription>Crea tu contraseña para terminar de activar tu cuenta de EcoLink</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby="password-hint"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="passwordConfirmation">Confirmar contraseña</Label>
            <PasswordInput
              id="passwordConfirmation"
              autoComplete="new-password"
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              aria-invalid={Boolean(fieldErrors.passwordConfirmation)}
            />
          </div>

          <div className="-mt-4 flex flex-col gap-1.5">
            <PasswordStrengthMeter password={password} />
            <p
              id="password-hint"
              className="text-xs text-muted-foreground"
              role={fieldErrors.password || fieldErrors.passwordConfirmation ? 'alert' : undefined}
            >
              {fieldErrors.password ??
                fieldErrors.passwordConfirmation ??
                'Debe tener al menos 8 caracteres, con mayúscula, minúscula y número.'}
            </p>
          </div>

          {(formError || rateLimitMessage) && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {rateLimitMessage ?? formError}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting || isRateLimited} className="w-full">
            {isSubmitting ? 'Activando…' : 'Activar cuenta'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
