'use client'

import { useEffect, useState } from 'react'
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
import { PasswordInput } from '@/components/ui/password-input'
import { PasswordStrengthMeter } from '@/components/ui/password-strength-meter'
import { ApiValidationError, RateLimitError, resetPassword, verifyPasswordRecoveryCode } from 'app/features/auth/api'
import { resetPasswordSchema, verifyRecoveryCodeSchema } from 'app/features/auth/schemas'
import { useRateLimitCountdown } from 'app/features/auth/useRateLimitCountdown'
import { readPasswordRecoveryEmail } from './passwordRecoveryStorage'

type PasswordFieldErrors = Partial<Record<'password' | 'passwordConfirmation', string>>

// CU-009.2/CU-009.4-CU-009.5 (POST /api/password/verify-code y POST
// /api/password/reset): un solo formulario visual con dos pasos internos
// (código -> nueva contraseña), sin navegación aparte -- el email llega por
// sessionStorage desde ForgotPasswordForm y nunca se vuelve a pedir (ni
// viaja por query string, ver passwordRecoveryStorage.ts). Se lee una sola
// vez en el estado inicial (no en un useEffect) para que sobreviva una
// recarga de página en medio de este mismo flujo de 2 pasos -- es la misma
// pestaña, sessionStorage persiste ese refresh sin problema.
//
// El backend revalida el código en reset() de forma independiente (no
// confía en el "verified" de este paso, ver aviso en
// PasswordRecoveryController::reset()) -- por eso el paso 2 puede fallar
// con el mismo error genérico aunque el paso 1 haya sido exitoso (código
// expirado o intentos agotados entre medio). Ese caso ofrece un enlace para
// pedir un código nuevo en vez de dejar al usuario atascado.
export function ResetPasswordForm() {
  const router = useRouter()
  const [email] = useState<string | null>(() => readPasswordRecoveryEmail())

  const [step, setStep] = useState<'code' | 'password'>('code')
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)

  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [fieldErrors, setFieldErrors] = useState<PasswordFieldErrors>({})
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetErrorNeedsNewCode, setResetErrorNeedsNewCode] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  // Rate limiting compartido por los 3 endpoints de CU-009
  // (RateLimiter::for('password-recovery', ...)) -- una sola cuenta
  // regresiva para ambos pasos de esta pantalla.
  const { secondsRemaining, isRateLimited, start: startRateLimitCountdown } = useRateLimitCountdown()
  const rateLimitMessage =
    secondsRemaining !== null ? `Demasiados intentos. Intenta de nuevo en ${secondsRemaining} segundos.` : null

  useEffect(() => {
    if (!email) {
      router.push('/forgot-password')
    }
  }, [email, router])

  if (!email) {
    return null
  }

  async function handleVerifyCode(event: React.FormEvent) {
    event.preventDefault()
    setCodeError(null)

    if (isRateLimited) {
      return
    }

    const parsed = verifyRecoveryCodeSchema.safeParse({ email, code })
    if (!parsed.success) {
      setCodeError(parsed.error.issues[0]?.message ?? 'Revisa el código ingresado.')
      return
    }

    setIsVerifying(true)
    try {
      await verifyPasswordRecoveryCode(parsed.data.email, parsed.data.code)
      setStep('password')
    } catch (err) {
      if (err instanceof RateLimitError) {
        startRateLimitCountdown(err.retryAfterSeconds)
      } else if (err instanceof ApiValidationError) {
        setCodeError(err.firstError('code') ?? err.message)
      } else {
        setCodeError(err instanceof Error ? err.message : 'Error inesperado.')
      }
    } finally {
      setIsVerifying(false)
    }
  }

  async function handleResetPassword(event: React.FormEvent) {
    event.preventDefault()
    setResetError(null)
    setResetErrorNeedsNewCode(false)

    if (isRateLimited) {
      return
    }

    const parsed = resetPasswordSchema.safeParse({ email, code, password, passwordConfirmation })
    if (!parsed.success) {
      const errors: PasswordFieldErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof PasswordFieldErrors
        errors[key] ??= issue.message
      }
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    setIsResetting(true)
    try {
      await resetPassword(parsed.data)
      router.push('/login?reset=1')
    } catch (err) {
      if (err instanceof RateLimitError) {
        startRateLimitCountdown(err.retryAfterSeconds)
      } else if (err instanceof ApiValidationError) {
        const codeErrorMessage = err.firstError('code')
        setResetError(codeErrorMessage ?? err.firstError('password') ?? err.message)
        setResetErrorNeedsNewCode(Boolean(codeErrorMessage))
      } else {
        setResetError(err instanceof Error ? err.message : 'Error inesperado.')
      }
    } finally {
      setIsResetting(false)
    }
  }

  if (step === 'code') {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Verifica tu código</CardTitle>
          <CardDescription>Ingresa el código de 6 dígitos que enviamos a {email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerifyCode} className="flex flex-col gap-6" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">Código de verificación</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                aria-invalid={Boolean(codeError || rateLimitMessage)}
                aria-describedby={codeError || rateLimitMessage ? 'code-error' : undefined}
                autoFocus
              />
            </div>

            {(codeError || rateLimitMessage) && (
              <p id="code-error" className="text-sm text-destructive" role="alert" aria-live="polite">
                {rateLimitMessage ?? codeError}
              </p>
            )}

            <Button type="submit" disabled={isVerifying || isRateLimited} className="w-full">
              {isVerifying ? 'Verificando…' : 'Verificar código'}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              <a href="/forgot-password" className="underline underline-offset-4">
                Solicitar un código nuevo
              </a>
            </p>
          </form>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Elige tu nueva contraseña</CardTitle>
        <CardDescription>Crea una nueva contraseña para tu cuenta EcoLink</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleResetPassword} className="flex flex-col gap-6" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Nueva contraseña</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby="password-hint"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="passwordConfirmation">Confirmar nueva contraseña</Label>
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

          {(resetError || rateLimitMessage) && (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm text-destructive" role="alert" aria-live="polite">
                {rateLimitMessage ?? resetError}
              </p>
              {resetErrorNeedsNewCode && !rateLimitMessage && (
                <a href="/forgot-password" className="text-sm underline underline-offset-4">
                  Solicitar un código nuevo
                </a>
              )}
            </div>
          )}

          <Button type="submit" disabled={isResetting || isRateLimited} className="w-full">
            {isResetting ? 'Restableciendo…' : 'Restablecer contraseña'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
