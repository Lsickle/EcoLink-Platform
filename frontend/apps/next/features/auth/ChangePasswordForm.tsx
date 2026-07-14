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
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { PasswordStrengthMeter } from '@/components/ui/password-strength-meter'
import { ApiValidationError, changePassword } from 'app/features/auth/api'
import { changePasswordSchema } from 'app/features/auth/schemas'
import { useRequireAuth } from 'app/provider/auth'

type FieldErrors = Partial<Record<'currentPassword' | 'newPassword' | 'newPasswordConfirmation', string>>

// PUT /api/password (AuthController::changePassword) -- protegido por
// auth:sanctum, de ahí useRequireAuth (redirige a /login si no hay sesión).
export function ChangePasswordForm() {
  const router = useRouter()
  const { user, isLoading } = useRequireAuth()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isLoading || !user) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    setSuccessMessage(null)

    const parsed = changePasswordSchema.safeParse({
      currentPassword,
      newPassword,
      newPasswordConfirmation,
    })

    if (!parsed.success) {
      const errors: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors
        errors[key] ??= issue.message
      }
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)
    try {
      await changePassword(parsed.data)
      setSuccessMessage('Contraseña actualizada.')
      setCurrentPassword('')
      setNewPassword('')
      setNewPasswordConfirmation('')
    } catch (error) {
      if (error instanceof ApiValidationError) {
        // El backend usa nombres de columna (current_password/password), no
        // los nombres de campo del formulario -- se mapean explícitamente.
        const currentPasswordError = error.firstError('current_password')
        const newPasswordError = error.firstError('password')
        setFieldErrors({ currentPassword: currentPasswordError, newPassword: newPasswordError })
        setFormError(currentPasswordError || newPasswordError ? null : error.message)
      } else {
        setFormError(error instanceof Error ? error.message : 'Error inesperado.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Cambiar contraseña</CardTitle>
        <CardDescription>Actualiza la contraseña de tu cuenta EcoLink</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currentPassword">Contraseña actual</Label>
            <PasswordInput
              id="currentPassword"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.currentPassword)}
              aria-describedby={fieldErrors.currentPassword ? 'currentPassword-error' : undefined}
            />
            {fieldErrors.currentPassword && (
              <p id="currentPassword-error" className="text-xs text-destructive" role="alert">
                {fieldErrors.currentPassword}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPassword">Nueva contraseña</Label>
            <PasswordInput
              id="newPassword"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.newPassword)}
              aria-describedby="newPassword-hint"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPasswordConfirmation">Confirmar nueva contraseña</Label>
            <PasswordInput
              id="newPasswordConfirmation"
              autoComplete="new-password"
              value={newPasswordConfirmation}
              onChange={(event) => setNewPasswordConfirmation(event.target.value)}
              aria-invalid={Boolean(fieldErrors.newPasswordConfirmation)}
            />
          </div>

          <div className="-mt-4 flex flex-col gap-1.5">
            <PasswordStrengthMeter password={newPassword} />
            <p
              id="newPassword-hint"
              className="text-xs text-muted-foreground"
              role={fieldErrors.newPassword || fieldErrors.newPasswordConfirmation ? 'alert' : undefined}
            >
              {fieldErrors.newPassword ??
                fieldErrors.newPasswordConfirmation ??
                'Debe tener al menos 8 caracteres, con mayúscula, minúscula y número.'}
            </p>
          </div>

          {formError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {formError}
            </p>
          )}

          {successMessage && (
            <p
              className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground"
              role="status"
              aria-live="polite"
            >
              {successMessage}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Actualizando…' : 'Actualizar contraseña'}
          </Button>

          <Button type="button" variant="ghost" className="w-full" onClick={() => router.push('/')}>
            Volver
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
