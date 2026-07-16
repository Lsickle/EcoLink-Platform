'use client'

import { useEffect, useState } from 'react'
import { IdCard } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  fetchContact,
  updateContact,
  type AdminContactDetail,
  type ContactOrganizationLink,
} from 'app/features/admin/api'
import { documentTypeOptions } from 'app/features/auth/schemas'
import { useRequireAuth } from 'app/provider/auth'

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  )
}

// Módulo standalone "Contactos" -- pantalla de detalle. Acceso DUAL (mismo
// gate `contacts.read` que ContactsListScreen.tsx): platform staff Y un
// admin de tenant con el permiso pueden ABRIR esta pantalla, pero SOLO
// platform staff puede EDITAR los datos de la Persona (RN-189/D-P02: son
// compartidos entre organizaciones si el contacto está vinculado a varias
// -- ver docblock de `ContactController::update()`). Por eso el gate de
// acceso es `useRequireAuth('contacts.read')` (SIN `requirePlatformStaff`,
// a diferencia de OrganizationsListScreen -- un tenant admin con el permiso
// SÍ debe poder abrir esta pantalla) y la capacidad de editar se decide
// aparte, leyendo `user.is_platform_staff` del mismo resultado.
export function ContactDetailScreen({ contactId }: { contactId: number | string }) {
  const { isAuthorized, user } = useRequireAuth('contacts.read')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [contact, setContact] = useState<AdminContactDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Formulario de edición -- solo se usa (y solo se renderiza) si
  // `isPlatformStaff` es true.
  const [documentType, setDocumentType] = useState('CC')
  const [documentNumber, setDocumentNumber] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    setIsLoading(true)
    fetchContact(contactId)
      .then((result) => {
        if (cancelled) return
        const person = result.person
        setContact(person)
        setDocumentType(person.document_type)
        setDocumentNumber(person.document_number)
        setFirstName(person.first_name)
        setLastName(person.last_name)
        setEmail(person.email ?? '')
        setPhone(person.phone ?? '')
        setLoadError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthorized, contactId])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!contact) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      const { person: updated } = await updateContact(contact.id, {
        document_type: documentType,
        document_number: documentNumber,
        first_name: firstName,
        last_name: lastName,
        email: email || null,
        phone: phone || null,
      })
      // updateContact() no devuelve `organization_links` -- se preserva el
      // array ya cargado desde fetchContact() (ver docblock de
      // UpdateContactPayload en types.ts).
      setContact((current) => (current ? { ...current, ...updated } : current))
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'document_number'))
    } finally {
      setIsSaving(false)
    }
  }

  if (!isAuthorized || isLoading) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  if (loadError || !contact) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró el contacto.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden py-0">
        <CardHeader className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              {contact.first_name.charAt(0).toUpperCase() || <IdCard className="size-5" aria-hidden="true" />}
            </div>
            <div>
              <CardTitle className="text-xl">
                {contact.first_name} {contact.last_name}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {contact.document_type} {contact.document_number}
              </p>
            </div>
          </div>
          <Badge variant={contact.has_user_account ? 'default' : 'secondary'}>
            Cuenta de Usuario: {contact.has_user_account ? 'Sí' : 'No'}
          </Badge>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de la Persona</CardTitle>
        </CardHeader>
        <CardContent>
          {isPlatformStaff ? (
            <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="documentNumber">Número de Documento</Label>
                  <Input id="documentNumber" value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="documentType">Tipo</Label>
                  <Select
                    items={documentTypeOptions.map((option) => ({ value: option.value, label: option.value }))}
                    value={documentType}
                    onValueChange={(value) => setDocumentType(value as string)}
                  >
                    <SelectTrigger id="documentType" className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {documentTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div />

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="firstName">Nombres</Label>
                <Input id="firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lastName">Apellidos</Label>
                <Input id="lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">
                  Correo <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">
                  Teléfono <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
              </div>

              {saveError && (
                <p className="text-sm text-destructive sm:col-span-2" role="alert">
                  {saveError}
                </p>
              )}
              {saveMessage && (
                <p className="text-sm text-muted-foreground sm:col-span-2" role="status">
                  {saveMessage}
                </p>
              )}

              <div className="flex justify-end sm:col-span-2">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoField label="Número de Documento">
                {contact.document_type} {contact.document_number}
              </InfoField>
              <InfoField label="Nombres">{contact.first_name}</InfoField>
              <InfoField label="Apellidos">{contact.last_name}</InfoField>
              <InfoField label="Correo">{contact.email ?? '—'}</InfoField>
              <InfoField label="Teléfono">{contact.phone ?? '—'}</InfoField>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Organizaciones Vinculadas{' '}
            <span className="text-sm font-normal text-muted-foreground">({contact.organization_links.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organización</TableHead>
                  <TableHead>Sede</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Tipo de Relación</TableHead>
                  <TableHead>Principal</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contact.organization_links.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Este contacto no tiene organizaciones vinculadas.
                    </TableCell>
                  </TableRow>
                )}
                {contact.organization_links.map((link: ContactOrganizationLink) => (
                  <TableRow key={link.organization_contact_id}>
                    <TableCell className="font-medium">{link.organization_name ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{link.branch_name ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{link.position_title ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{link.relationship_type ?? '—'}</TableCell>
                    <TableCell>
                      {link.is_primary && <Badge variant="outline">Principal</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={link.is_active ? 'default' : 'secondary'}>
                        {link.is_active ? 'Activo' : 'Revocado'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
