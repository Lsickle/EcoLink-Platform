'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { fetchContacts, type AdminContact } from 'app/features/admin/api'
import { useRequireAuth } from 'app/provider/auth'

const PER_PAGE = 15

// Mismo umbral usado en el resto de listados admin/* (OrganizationsListScreen.tsx/
// UsersListScreen.tsx).
const SEARCH_DEBOUNCE_MS = 300

// Módulo standalone "Contactos" -- distinto del panel de contactos ya
// existente dentro de Organización/Sede (`OrganizationContactsPanel.tsx`,
// sin tocar). Acceso DUAL: platform staff ve TODOS los contactos, un admin
// de tenant (`contacts.read`) solo los vinculados a su propia organización
// -- ya resuelto por el backend (ver `ContactController::index()`), esta
// pantalla solo refleja lo que la API devuelve. De solo consulta/navegación
// -- SIN botón "+ Crear Contacto" (crear siempre pasa por el contexto de una
// organización/sede concreta, ver `OrganizationContactsPanel.tsx`).
export function ContactsListScreen() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('contacts.read')

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
  }, [isAuthorized, page, search])

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const rangeEnd = Math.min(page * PER_PAGE, total)

  return (
    <div className="flex flex-col gap-4">
      <Input
        placeholder="Buscar por nombre, documento o correo…"
        value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
        className="sm:max-w-xs"
        aria-label="Buscar contactos"
      />

      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
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
