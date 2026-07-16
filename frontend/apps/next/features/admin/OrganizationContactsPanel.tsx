'use client'

import { useEffect, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  createOrganizationContact,
  revokeOrganizationContact,
  searchContacts,
  type AdminOrganizationContact,
  type ContactSearchResult,
  type OrganizationContactRelationshipType,
} from 'app/features/admin/api'
import { documentTypeOptions } from 'app/features/auth/schemas'

const RELATIONSHIP_TYPES: OrganizationContactRelationshipType[] = ['Empleado', 'Consultor', 'Externo']

const SEARCH_DEBOUNCE_MS = 300

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

type BranchOption = { id: number; name: string }

type OrganizationContactsPanelProps = {
  organizationId: number | string
  contacts: AdminOrganizationContact[]
  isLoading: boolean
  loadError: string | null
  /** Sedes de ESTA organización -- puebla el selector "Sede" del formulario y resuelve el nombre en la columna "Sede". */
  branches: BranchOption[]
  /**
   * Presente SOLO cuando el panel se usa desde `BranchDetailScreen` -- fija
   * `branch_id` en los formularios de creación/vínculo y OCULTA la columna
   * "Sede" (redundante, ya se sabe qué sede es -- mismo criterio que
   * `AdminOrganizationContact.branch_id` ausente en
   * `BranchController::contacts()`).
   */
  lockedBranchId?: number
  onChanged: () => void
}

// Panel compartido por el tab "Contactos" de `OrganizationDetailScreen` y de
// `BranchDetailScreen` (plan "CRUD de Sedes + Contactos", D-P02/L-08) --
// tabla con columnas derivadas del vínculo (Cargo/Sede/Tipo de Relación) +
// "Crear Contacto" (persona nueva) + "Vincular Contacto Existente" (combo de
// búsqueda vía `searchContacts()`, con debounce) + "Revocar" por fila (con
// confirmación, AlertDialog).
export function OrganizationContactsPanel({
  organizationId,
  contacts,
  isLoading,
  loadError,
  branches,
  lockedBranchId,
  onChanged,
}: OrganizationContactsPanelProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [pendingRevoke, setPendingRevoke] = useState<AdminOrganizationContact | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const branchNameById = new Map(branches.map((branch) => [branch.id, branch.name]))
  const showBranchColumn = lockedBranchId === undefined

  async function handleConfirmRevoke() {
    if (!pendingRevoke) return
    setIsRevoking(true)
    setRevokeError(null)
    try {
      await revokeOrganizationContact(organizationId, pendingRevoke.organization_contact_id)
      setPendingRevoke(null)
      onChanged()
    } catch (error) {
      setRevokeError(errorMessage(error, 'organization_contact'))
    } finally {
      setIsRevoking(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap justify-end gap-2">
        <LinkExistingContactDialog
          open={linkOpen}
          onOpenChange={setLinkOpen}
          organizationId={organizationId}
          branches={branches}
          lockedBranchId={lockedBranchId}
          onLinked={() => {
            setLinkOpen(false)
            onChanged()
          }}
        />
        <CreateContactDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          organizationId={organizationId}
          branches={branches}
          lockedBranchId={lockedBranchId}
          onCreated={() => {
            setCreateOpen(false)
            onChanged()
          }}
        />
      </div>

      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      )}
      {revokeError && (
        <p className="text-sm text-destructive" role="alert">
          {revokeError}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground" role="status">
          Cargando…
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Cargo</TableHead>
                {showBranchColumn && <TableHead>Sede</TableHead>}
                <TableHead>Tipo de Relación</TableHead>
                <TableHead>Cuenta de Usuario</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={showBranchColumn ? 7 : 6} className="text-center text-muted-foreground">
                    No hay contactos registrados.
                  </TableCell>
                </TableRow>
              )}
              {contacts.map((contact) => {
                const branchId = lockedBranchId ?? contact.branch_id ?? null
                const branchName = branchId != null ? (branchNameById.get(branchId) ?? '—') : '—'
                return (
                  <TableRow key={contact.organization_contact_id}>
                    <TableCell>{contact.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{contact.email ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{contact.position_title ?? '—'}</TableCell>
                    {showBranchColumn && <TableCell className="text-muted-foreground">{branchName}</TableCell>}
                    <TableCell className="text-muted-foreground">{contact.relationship_type ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={contact.has_user_account ? 'default' : 'secondary'}>
                        {contact.has_user_account ? 'Sí' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Revocar contacto ${contact.full_name}`}
                        onClick={() => setPendingRevoke(contact)}
                      >
                        Revocar
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={pendingRevoke !== null} onOpenChange={(open) => !open && setPendingRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revocar contacto</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que quieres revocar el vínculo de {pendingRevoke?.full_name} con la organización? No se elimina
              a la persona, solo el vínculo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isRevoking} onClick={handleConfirmRevoke}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function LinkFields({
  branches,
  lockedBranchId,
  branchId,
  onBranchIdChange,
  positionTitle,
  onPositionTitleChange,
  relationshipType,
  onRelationshipTypeChange,
  isPrimary,
  onIsPrimaryChange,
  idPrefix,
}: {
  branches: BranchOption[]
  lockedBranchId?: number
  branchId: number | null
  onBranchIdChange: (value: number | null) => void
  positionTitle: string
  onPositionTitleChange: (value: string) => void
  relationshipType: OrganizationContactRelationshipType | ''
  onRelationshipTypeChange: (value: OrganizationContactRelationshipType | '') => void
  isPrimary: boolean
  onIsPrimaryChange: (value: boolean) => void
  idPrefix: string
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-positionTitle`}>
          Cargo <span className="text-muted-foreground">(opcional)</span>
        </Label>
        <Input
          id={`${idPrefix}-positionTitle`}
          value={positionTitle}
          onChange={(event) => onPositionTitleChange(event.target.value)}
          placeholder="Ej. Gerente Ambiental"
        />
      </div>
      {lockedBranchId === undefined && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-branchId`}>
            Sede <span className="text-muted-foreground">(opcional)</span>
          </Label>
          <Select
            items={[{ value: 'none', label: 'Sin sede específica' }, ...branches.map((b) => ({ value: String(b.id), label: b.name }))]}
            value={branchId !== null ? String(branchId) : 'none'}
            onValueChange={(value) => onBranchIdChange(value === 'none' ? null : Number(value))}
          >
            <SelectTrigger id={`${idPrefix}-branchId`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin sede específica</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={String(branch.id)}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-relationshipType`}>
          Tipo de Relación <span className="text-muted-foreground">(opcional)</span>
        </Label>
        <Select
          items={[{ value: 'none', label: 'Sin especificar' }, ...RELATIONSHIP_TYPES.map((v) => ({ value: v, label: v }))]}
          value={relationshipType || 'none'}
          onValueChange={(value) => onRelationshipTypeChange(value === 'none' ? '' : (value as OrganizationContactRelationshipType))}
        >
          <SelectTrigger id={`${idPrefix}-relationshipType`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin especificar</SelectItem>
            {RELATIONSHIP_TYPES.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${idPrefix}-isPrimary`}
          checked={isPrimary}
          onCheckedChange={(checked) => onIsPrimaryChange(checked === true)}
        />
        <Label htmlFor={`${idPrefix}-isPrimary`} className="font-normal">
          Contacto principal
        </Label>
      </div>
    </>
  )
}

function CreateContactDialog({
  open,
  onOpenChange,
  organizationId,
  branches,
  lockedBranchId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: number | string
  branches: BranchOption[]
  lockedBranchId?: number
  onCreated: () => void
}) {
  const [documentType, setDocumentType] = useState<'CC' | 'CE' | 'PA'>('CC')
  const [documentNumber, setDocumentNumber] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [branchId, setBranchId] = useState<number | null>(lockedBranchId ?? null)
  const [positionTitle, setPositionTitle] = useState('')
  const [relationshipType, setRelationshipType] = useState<OrganizationContactRelationshipType | ''>('')
  const [isPrimary, setIsPrimary] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function reset() {
    setDocumentType('CC')
    setDocumentNumber('')
    setFirstName('')
    setLastName('')
    setEmail('')
    setPhone('')
    setBranchId(lockedBranchId ?? null)
    setPositionTitle('')
    setRelationshipType('')
    setIsPrimary(false)
    setFormError(null)
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (!nextOpen) reset()
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    if (!documentNumber.trim() || !firstName.trim() || !lastName.trim()) {
      setFormError('Completa documento, nombres y apellidos.')
      return
    }
    setIsSubmitting(true)
    try {
      await createOrganizationContact(organizationId, {
        document_type: documentType,
        document_number: documentNumber.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        branch_id: (lockedBranchId ?? branchId) ?? undefined,
        position_title: positionTitle.trim() || undefined,
        relationship_type: relationshipType || undefined,
        is_primary: isPrimary,
      })
      reset()
      onCreated()
    } catch (error) {
      setFormError(errorMessage(error, 'document_number'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button>+ Crear Contacto</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear Contacto</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-documentNumber">Número de Documento</Label>
              <Input
                id="contact-documentNumber"
                value={documentNumber}
                onChange={(event) => setDocumentNumber(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-documentType">Tipo</Label>
              <Select
                items={documentTypeOptions.map((o) => ({ value: o.value, label: o.value }))}
                value={documentType}
                onValueChange={(value) => setDocumentType(value as 'CC' | 'CE' | 'PA')}
              >
                <SelectTrigger id="contact-documentType" className="w-full sm:w-24">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-firstName">Nombres</Label>
              <Input id="contact-firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-lastName">Apellidos</Label>
              <Input id="contact-lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-email">
                Correo <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input id="contact-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-phone">
                Teléfono <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input id="contact-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </div>
          </div>

          <LinkFields
            branches={branches}
            lockedBranchId={lockedBranchId}
            branchId={branchId}
            onBranchIdChange={setBranchId}
            positionTitle={positionTitle}
            onPositionTitleChange={setPositionTitle}
            relationshipType={relationshipType}
            onRelationshipTypeChange={setRelationshipType}
            isPrimary={isPrimary}
            onIsPrimaryChange={setIsPrimary}
            idPrefix="create-contact"
          />

          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear Contacto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function LinkExistingContactDialog({
  open,
  onOpenChange,
  organizationId,
  branches,
  lockedBranchId,
  onLinked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: number | string
  branches: BranchOption[]
  lockedBranchId?: number
  onLinked: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContactSearchResult[]>([])
  const [selected, setSelected] = useState<ContactSearchResult | null>(null)
  const [branchId, setBranchId] = useState<number | null>(lockedBranchId ?? null)
  const [positionTitle, setPositionTitle] = useState('')
  const [relationshipType, setRelationshipType] = useState<OrganizationContactRelationshipType | ''>('')
  const [isPrimary, setIsPrimary] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const timeout = setTimeout(() => {
      searchContacts({ q: query.trim(), perPage: 10 })
        .then((result) => setResults(result.data))
        .catch(() => setResults([]))
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [query])

  function reset() {
    setQuery('')
    setResults([])
    setSelected(null)
    setBranchId(lockedBranchId ?? null)
    setPositionTitle('')
    setRelationshipType('')
    setIsPrimary(false)
    setFormError(null)
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (!nextOpen) reset()
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    if (!selected) {
      setFormError('Selecciona un contacto de la búsqueda.')
      return
    }
    setIsSubmitting(true)
    try {
      await createOrganizationContact(organizationId, {
        existing_contact_id: selected.id,
        branch_id: (lockedBranchId ?? branchId) ?? undefined,
        position_title: positionTitle.trim() || undefined,
        relationship_type: relationshipType || undefined,
        is_primary: isPrimary,
      })
      reset()
      onLinked()
    } catch (error) {
      setFormError(errorMessage(error, 'existing_contact_id'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline">Vincular Contacto Existente</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular Contacto Existente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
          {selected ? (
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-border px-2.5 py-1.5 text-sm">
                {selected.first_name} {selected.last_name} ({selected.document_number})
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => setSelected(null)}>
                Quitar
              </Button>
            </div>
          ) : (
            <div className="relative flex flex-col gap-1.5">
              <Label htmlFor="link-contact-search">Buscar contacto</Label>
              <Input
                id="link-contact-search"
                placeholder="Nombre, documento o correo…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {results.length > 0 && (
                <ul className="absolute top-full z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
                  {results.map((result) => (
                    <li key={result.id}>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setSelected(result)
                          setQuery('')
                          setResults([])
                        }}
                      >
                        {result.first_name} {result.last_name}{' '}
                        <span className="text-muted-foreground">({result.document_number})</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <LinkFields
            branches={branches}
            lockedBranchId={lockedBranchId}
            branchId={branchId}
            onBranchIdChange={setBranchId}
            positionTitle={positionTitle}
            onPositionTitleChange={setPositionTitle}
            relationshipType={relationshipType}
            onRelationshipTypeChange={setRelationshipType}
            isPrimary={isPrimary}
            onIsPrimaryChange={setIsPrimary}
            idPrefix="link-contact"
          />

          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || !selected}>
              {isSubmitting ? 'Vinculando…' : 'Vincular'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
