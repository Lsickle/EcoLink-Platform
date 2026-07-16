'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiValidationError, createUser, fetchRoles, type AdminRole } from 'app/features/admin/api'
import { createUserSchema, documentTypeOptions } from 'app/features/admin/schemas'
import { useRequireAuth } from 'app/provider/auth'

type FieldErrors = Partial<
  Record<'documentNumber' | 'firstName' | 'lastName' | 'username' | 'email', string>
>

// POST /api/admin/users -- organization_id se omite a propósito (no hay UI
// de Organizaciones todavía, ver contrato del lote RBAC).
export function CreateUserForm() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('users.read')
  const [roles, setRoles] = useState<AdminRole[]>([])

  const [documentType, setDocumentType] = useState<'CC' | 'CE' | 'PA'>('CC')
  const [documentNumber, setDocumentNumber] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [secondLastName, setSecondLastName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [roleIds, setRoleIds] = useState<number[]>([])

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isAuthorized) return
    fetchRoles({ perPage: 100 })
      .then((result) => setRoles(result.data))
      .catch(() => setRoles([]))
  }, [isAuthorized])

  function toggleRole(roleId: number) {
    setRoleIds((current) => (current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId]))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const parsed = createUserSchema.safeParse({
      documentType,
      documentNumber,
      firstName,
      lastName,
      middleName,
      secondLastName,
      username,
      email,
      phone,
      roleIds,
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
      await createUser({
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        middle_name: parsed.data.middleName || undefined,
        second_last_name: parsed.data.secondLastName || undefined,
        document_type: parsed.data.documentType,
        document_number: parsed.data.documentNumber,
        username: parsed.data.username,
        email: parsed.data.email,
        phone: parsed.data.phone || undefined,
        role_ids: parsed.data.roleIds,
      })
      router.push('/admin/users')
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setFormError(
          error.firstError('email') ??
            error.firstError('username') ??
            error.firstError('document_number') ??
            error.message
        )
      } else {
        setFormError(error instanceof Error ? error.message : 'Error inesperado.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-xl">Crear Usuario</CardTitle>
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
                value={documentNumber}
                onChange={(event) => setDocumentNumber(event.target.value)}
                aria-invalid={Boolean(fieldErrors.documentNumber)}
              />
              {fieldErrors.documentNumber && (
                <p className="text-xs text-destructive" role="alert">
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
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                aria-invalid={Boolean(fieldErrors.firstName)}
              />
              {fieldErrors.firstName && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.firstName}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="middleName">
                Segundo nombre <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input id="middleName" value={middleName} onChange={(event) => setMiddleName(event.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lastName">Apellidos</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                aria-invalid={Boolean(fieldErrors.lastName)}
              />
              {fieldErrors.lastName && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.lastName}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="secondLastName">
                Segundo apellido <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="secondLastName"
                value={secondLastName}
                onChange={(event) => setSecondLastName(event.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Nombre de usuario</Label>
              <Input
                id="username"
                autoComplete="off"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                aria-invalid={Boolean(fieldErrors.username)}
              />
              {fieldErrors.username && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.username}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErrors.email && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.email}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">
              Teléfono <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input id="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>

          <p className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground" role="status">
            Se enviará una invitación por correo electrónico para que el usuario active su cuenta y elija su
            contraseña.
          </p>

          <div className="flex flex-col gap-2">
            <Label>Roles</Label>
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              {roles.length === 0 && <p className="text-sm text-muted-foreground">No hay roles disponibles.</p>}
              {roles.map((role) => (
                <div key={role.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`role-${role.id}`}
                    checked={roleIds.includes(role.id)}
                    onCheckedChange={() => toggleRole(role.id)}
                  />
                  <Label htmlFor={`role-${role.id}`} className="font-normal">
                    {role.name}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {formError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/admin/users')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear Usuario'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
