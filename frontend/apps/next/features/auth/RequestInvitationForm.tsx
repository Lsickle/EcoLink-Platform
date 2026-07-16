'use client'

import { useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ApiValidationError, RateLimitError, requestInvitation } from 'app/features/auth/api'
import { documentTypeOptions, requestInvitationSchema } from 'app/features/auth/schemas'
import { useRateLimitCountdown } from 'app/features/auth/useRateLimitCountdown'

type FieldErrors = Partial<Record<'documentNumber' | 'firstName' | 'lastName' | 'email', string>>

// CU-006.1 modificado (mecanismo de invitación, reemplaza el registro
// público eliminado): POST /api/invitation-requests -- sin username/
// password, la cuenta la crea un administrador al aprobar. RN-181: el
// backend SIEMPRE responde el mismo mensaje genérico de éxito, exista o no
// ya el correo/documento (anti-enumeración) -- por eso, tras enviar, esta
// pantalla se queda en un estado de confirmación en vez de redirigir a
// /login (todavía no existe ninguna cuenta con la que iniciar sesión).
export function RequestInvitationForm() {
  const [documentType, setDocumentType] = useState<'CC' | 'CE' | 'PA'>('CC')
  const [documentNumber, setDocumentNumber] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  // Rate limiting de /api/invitation-requests (RateLimiter::for('invitation-request', ...)):
  // mismo patrón de cuenta regresiva en vivo que LoginForm.
  const { secondsRemaining, isRateLimited, start: startRateLimitCountdown } = useRateLimitCountdown()
  const rateLimitMessage =
    secondsRemaining !== null ? `Demasiados intentos. Intenta de nuevo en ${secondsRemaining} segundos.` : null

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    if (isRateLimited) {
      return
    }

    const parsed = requestInvitationSchema.safeParse({
      documentType,
      documentNumber,
      firstName,
      lastName,
      email,
      phone,
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
      await requestInvitation(parsed.data)
      setIsSubmitted(true)
    } catch (error) {
      if (error instanceof RateLimitError) {
        startRateLimitCountdown(error.retryAfterSeconds)
      } else if (error instanceof ApiValidationError) {
        setFormError(error.firstError('email') ?? error.message)
      } else {
        setFormError(error instanceof Error ? error.message : 'Error inesperado.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSubmitted) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Solicitud enviada</CardTitle>
          <CardDescription>
            Tu solicitud fue enviada. Un administrador la revisará y, si es aprobada, recibirás un correo con un
            enlace para activar tu cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{' '}
            <a href="/login" className="underline underline-offset-4">
              Inicia sesión
            </a>
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Solicita acceso a EcoLink</CardTitle>
        <CardDescription>
          Envía tus datos para que un administrador revise tu solicitud de acceso
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="documentType">Tipo de documento</Label>
              <Select value={documentType} onValueChange={(value) => setDocumentType(value as 'CC' | 'CE' | 'PA')}>
                <SelectTrigger id="documentType" className="w-full sm:w-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {documentTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="documentNumber">Número de documento</Label>
              <Input
                id="documentNumber"
                autoComplete="off"
                value={documentNumber}
                onChange={(event) => setDocumentNumber(event.target.value)}
                aria-invalid={Boolean(fieldErrors.documentNumber)}
                aria-describedby={fieldErrors.documentNumber ? 'documentNumber-error' : undefined}
              />
              {fieldErrors.documentNumber && (
                <p id="documentNumber-error" className="text-xs text-destructive" role="alert">
                  {fieldErrors.documentNumber}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="firstName">Nombres</Label>
              <Input
                id="firstName"
                autoComplete="given-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                aria-invalid={Boolean(fieldErrors.firstName)}
                aria-describedby={fieldErrors.firstName ? 'firstName-error' : undefined}
              />
              {fieldErrors.firstName && (
                <p id="firstName-error" className="text-xs text-destructive" role="alert">
                  {fieldErrors.firstName}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lastName">Apellidos</Label>
              <Input
                id="lastName"
                autoComplete="family-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                aria-invalid={Boolean(fieldErrors.lastName)}
                aria-describedby={fieldErrors.lastName ? 'lastName-error' : undefined}
              />
              {fieldErrors.lastName && (
                <p id="lastName-error" className="text-xs text-destructive" role="alert">
                  {fieldErrors.lastName}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="tu@empresa.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            />
            {fieldErrors.email && (
              <p id="email-error" className="text-xs text-destructive" role="alert">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">
              Teléfono <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder="300 000 0000"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>

          {(formError || rateLimitMessage) && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {rateLimitMessage ?? formError}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting || isRateLimited} className="w-full">
            {isSubmitting ? 'Enviando…' : 'Enviar solicitud'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{' '}
            <a href="/login" className="underline underline-offset-4">
              Inicia sesión
            </a>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
