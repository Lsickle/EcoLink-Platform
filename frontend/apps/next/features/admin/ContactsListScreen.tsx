'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { fetchBranches, fetchContacts, type AdminContact } from 'app/features/admin/api'
import { useRequireAuth } from 'app/provider/auth'
import { EcoLinkSpinner } from '@/components/ecolink-spinner'
import { CreateContactDialog } from './OrganizationContactsPanel'
import { OrganizationSearchSelect } from './OrganizationSearchSelect'

const PER_PAGE = 15

// Tope de sucursales ofrecidas en el selector "Sucursal" del diálogo de
// creación -- mismo valor que ya usa `OrganizationDetailScreen.tsx` para
// poblar el mismo selector del panel de contactos.
const BRANCH_OPTIONS_PER_PAGE = 100

// Mismo umbral usado en el resto de listados admin/* (OrganizationsListScreen.tsx/
// UsersListScreen.tsx).
const SEARCH_DEBOUNCE_MS = 300

// Módulo standalone "Contactos" -- distinto del panel de contactos ya
// existente dentro de Organización/Sede (`OrganizationContactsPanel.tsx`,
// sin tocar). Acceso DUAL: platform staff ve TODOS los contactos, un admin
// de tenant (`contacts.read`) solo los vinculados a su propia organización
// -- ya resuelto por el backend (ver `ContactController::index()`), esta
// pantalla solo refleja lo que la API devuelve.
//
// Botón "+ Crear Contacto" (decisión del usuario, 2026-10-01 -- reemplaza la
// anterior de "solo consulta, crear siempre desde una organización/sede"):
// visible SOLO con el permiso `contacts.create`, abre el MISMO formulario
// que el panel de Organización (`CreateContactDialog`, reutilizado, no
// duplicado) y pega contra el MISMO endpoint
// (`POST /admin/organizations/{organization}/contacts`). Un contacto sigue
// creándose SIEMPRE dentro de una organización (el listado solo devuelve
// personas con al menos un vínculo activo); lo único que cambia aquí es de
// dónde sale esa organización -- ver `CreateContactFromListDialog` abajo.
export function ContactsListScreen() {
  const router = useRouter()
  const { isAuthorized, user } = useRequireAuth('contacts.read')
  const isPlatformStaff = Boolean(user?.is_platform_staff)
  const tenantOrganizationId = user?.tenant_organization_id ?? null
  // Un admin de tenant sin organización propia no tendría dónde crear el
  // contacto (no puede elegir otra) -- no se le ofrece el botón.
  const canCreate =
    Boolean(user?.permissions?.includes('contacts.create')) && (isPlatformStaff || tenantOrganizationId !== null)

  const [createOpen, setCreateOpen] = useState(false)
  // Se incrementa tras crear un contacto para volver a pedir la página actual.
  const [reloadToken, setReloadToken] = useState(0)

  const [contacts, setContacts] = useState<AdminContact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    setIsLoading(true)
    fetchContacts({ page, perPage: PER_PAGE, search: search || undefined })
      .then((result) => {
        if (cancelled) return
        setContacts(result.data)
        setLastPage(result.last_page)
        setTotal(result.total)
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
  }, [isAuthorized, page, search, reloadToken])

  if (!isAuthorized) {
    return (
      <EcoLinkSpinner />
    )
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const rangeEnd = Math.min(page * PER_PAGE, total)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Buscar por nombre, documento o correo…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="sm:max-w-xs"
          aria-label="Buscar contactos"
        />
        {canCreate && (
          <CreateContactFromListDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            isPlatformStaff={isPlatformStaff}
            tenantOrganizationId={tenantOrganizationId}
            onCreated={() => {
              setCreateOpen(false)
              setReloadToken((current) => current + 1)
            }}
          />
        )}
      </div>

      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      )}

      {isLoading ? (
        <EcoLinkSpinner />
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Organizaciones</TableHead>
                <TableHead>Cuenta de Usuario</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No hay contactos que coincidan con la búsqueda.
                  </TableCell>
                </TableRow>
              )}
              {contacts.map((contact) => (
                <TableRow key={contact.id} className="cursor-pointer" onClick={() => router.push(`/admin/contacts/${contact.id}`)}>
                  <TableCell>
                    <Button
                      variant="link"
                      className="h-auto p-0 text-left font-medium"
                      onClick={(event) => {
                        event.stopPropagation()
                        router.push(`/admin/contacts/${contact.id}`)
                      }}
                    >
                      {contact.first_name} {contact.last_name}
                    </Button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {contact.document_type} {contact.document_number}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{contact.email ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{contact.phone ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {contact.organizations_count} {contact.organizations_count === 1 ? 'organización' : 'organizaciones'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={contact.has_user_account ? 'default' : 'secondary'}>
                      {contact.has_user_account ? 'Sí' : 'No'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <span className="text-sm text-muted-foreground">
          Mostrando {rangeStart}–{rangeEnd} de {total} contactos
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {lastPage}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => setPage((current) => current + 1)}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  )
}

type SelectedOrganization = { id: number; label: string }

type BranchOption = { id: number; name: string }

// Envuelve el `CreateContactDialog` del panel de Organización para el caso en
// que la organización NO viene dada por la pantalla:
// - Platform staff: la elige con `OrganizationSearchSelect` (obligatoria; el
//   diálogo rechaza el submit sin ella). `searchOrganizations()` sin
//   `capability` es exclusivo de platform staff en el backend, por eso el
//   selector solo se monta para ese actor.
// - Admin de tenant: sin selector, fija en su `tenant_organization_id` -- la
//   única que `OrganizationController::storeContact()` le acepta.
//
// Sucursales vía `fetchBranches()` (acceso DUAL) y NO vía
// `fetchOrganizationBranches()`: ese endpoint responde 403 a un admin de
// tenant aun para su propia organización. Platform staff filtra por la
// organización elegida; el tenant no manda filtro (el backend ya lo acota a
// la suya e ignoraría el parámetro).
function CreateContactFromListDialog({
  open,
  onOpenChange,
  isPlatformStaff,
  tenantOrganizationId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isPlatformStaff: boolean
  tenantOrganizationId: number | null
  onCreated: () => void
}) {
  const [selectedOrganization, setSelectedOrganization] = useState<SelectedOrganization | null>(null)
  // Sucursales cargadas JUNTO con la organización a la que pertenecen: las
  // de la organización anterior nunca deben quedar ofrecidas mientras llegan
  // las de la nueva (ver `branches` abajo).
  const [loadedBranches, setLoadedBranches] = useState<{ organizationId: number; options: BranchOption[] } | null>(
    null
  )

  const organizationId = isPlatformStaff ? (selectedOrganization?.id ?? null) : tenantOrganizationId

  useEffect(() => {
    if (!open || organizationId === null) return
    let cancelled = false
    fetchBranches(
      isPlatformStaff ? { organizationId, perPage: BRANCH_OPTIONS_PER_PAGE } : { perPage: BRANCH_OPTIONS_PER_PAGE }
    )
      .then((result) => {
        if (cancelled) return
        setLoadedBranches({
          organizationId,
          options: result.data.map((branch) => ({ id: branch.id, name: branch.name })),
        })
      })
      // Sin `branches.read` (403) el contacto igual se puede crear "sin
      // sucursal específica" -- la sucursal es opcional.
      .catch(() => {
        if (!cancelled) setLoadedBranches({ organizationId, options: [] })
      })
    return () => {
      cancelled = true
    }
  }, [open, organizationId, isPlatformStaff])

  const branches = loadedBranches?.organizationId === organizationId ? loadedBranches.options : []

  return (
    <CreateContactDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setSelectedOrganization(null)
        onOpenChange(nextOpen)
      }}
      organizationId={organizationId}
      organizationField={
        isPlatformStaff ? (
          <OrganizationSearchSelect
            label="Organización"
            htmlId="create-contact-organization"
            selectedId={selectedOrganization?.id ?? null}
            selectedLabel={selectedOrganization?.label ?? null}
            onSelect={(result) => setSelectedOrganization({ id: result.id, label: result.legal_name })}
            onClear={() => setSelectedOrganization(null)}
          />
        ) : undefined
      }
      branches={branches}
      onCreated={() => {
        setSelectedOrganization(null)
        onCreated()
      }}
    />
  )
}
