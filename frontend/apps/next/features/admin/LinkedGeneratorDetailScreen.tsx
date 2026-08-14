'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  fetchLinkedGeneratorBranches,
  fetchLinkedGeneratorContacts,
  fetchLinkedOrganizationSummary,
  fetchOrganizationUsers,
  type AdminUser,
  type LinkedGeneratorBranch,
  type LinkedGeneratorContact,
  type LinkedOrganizationSummary,
} from 'app/features/admin/api'
import { useRequireAuth } from 'app/provider/auth'

const PER_PAGE = 15

/**
 * Pedido explícito del usuario, 2026-08-11: pantalla de SOLO LECTURA para
 * un Subgestor/Gestor con relación comercial ACTIVA hacia este Generador
 * (punto de entrada: botón "Ver detalles" en Generadores por Subgestor/
 * Gestor, o "Ver organización" desde la ficha de uno de sus usuarios).
 *
 * NO es `OrganizationDetailScreen.tsx` -- esa sigue siendo exclusiva de
 * platform staff (edición completa, business_roles, tabs de
 * sedes/contactos/actividad). Misma URL de backend
 * (`GET /api/admin/organizations/{id}`), shape de respuesta distinto según
 * quién pregunta (ver `OrganizationController::
 * transformLinkedGeneratorOrganization()`).
 *
 * Gateada solo con autenticación simple (`useRequireAuth()`, sin permiso
 * específico) -- la autorización real la resuelve el backend (`User::
 * hasActiveGeneratorRelationshipWith()`); un 403 se muestra como mensaje de
 * error, igual que el resto de pantallas admin.
 */
export function LinkedGeneratorDetailScreen({ organizationId }: { organizationId: number | string }) {
  const { isAuthorized } = useRequireAuth()
  const router = useRouter()

  const [activeTab, setActiveTab] = useState<'usuarios' | 'sucursales' | 'contactos'>('usuarios')
  const [organization, setOrganization] = useState<LinkedOrganizationSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError, setUsersError] = useState<string | null>(null)

  // Sedes y contactos del Generador vinculado (pedido del usuario,
  // 2026-08-14): el Gestor/Subgestor los necesita para coordinar
  // recolecciones. Llegan con shape REDUCIDO desde el backend -- ver
  // `LinkedGeneratorBranch`/`LinkedGeneratorContact`.
  const [branches, setBranches] = useState<LinkedGeneratorBranch[]>([])
  const [branchesLoading, setBranchesLoading] = useState(true)
  const [branchesError, setBranchesError] = useState<string | null>(null)

  const [contacts, setContacts] = useState<LinkedGeneratorContact[]>([])
  const [contactsLoading, setContactsLoading] = useState(true)
  const [contactsError, setContactsError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchLinkedOrganizationSummary(organizationId)
      .then((result) => {
        if (cancelled) return
        setOrganization(result.organization)
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
  }, [isAuthorized, organizationId])

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchOrganizationUsers(organizationId, { perPage: PER_PAGE })
      .then((result) => {
        if (cancelled) return
        setUsers(result.data)
        setUsersError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setUsersError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthorized, organizationId])

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchLinkedGeneratorBranches(organizationId, { perPage: PER_PAGE })
      .then((result) => {
        if (cancelled) return
        setBranches(result.data)
        setBranchesError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setBranchesError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setBranchesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthorized, organizationId])

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchLinkedGeneratorContacts(organizationId, { perPage: PER_PAGE })
      .then((result) => {
        if (cancelled) return
        setContacts(result.data)
        setContactsError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setContactsError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setContactsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthorized, organizationId])

  if (!isAuthorized || isLoading) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  if (loadError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError}
      </p>
    )
  }

  if (!organization) return null

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{organization.legal_name}</CardTitle>
          {organization.trade_name && <p className="text-sm text-muted-foreground">{organization.trade_name}</p>}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {organization.type.length === 0 && <span className="text-xs text-muted-foreground">Sin tipo asignado</span>}
            {organization.type.map((type) => (
              <Badge key={type} variant="outline">
                {type}
              </Badge>
            ))}
          </div>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium">NIT</dt>
              <dd className="text-sm text-muted-foreground">
                {organization.tax_id_type} {organization.tax_id}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium">Estado</dt>
              <dd className="text-sm text-muted-foreground">{organization.status.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium">Correo</dt>
              <dd className="text-sm text-muted-foreground">{organization.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium">Teléfono</dt>
              <dd className="text-sm text-muted-foreground">{organization.phone ?? '—'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Usuarios, Sucursales y Contactos en PESTAÑAS y no en cards apiladas
          (pedido del usuario, 2026-08-14): cualquiera de las tres puede traer
          una lista larga, y apiladas obligaban a un scroll vertical enorme. El
          detalle de la organización sí queda en su propia card arriba. */}
      <Card>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
            <TabsList>
              <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
              <TabsTrigger value="sucursales">Sucursales</TabsTrigger>
              <TabsTrigger value="contactos">Contactos</TabsTrigger>
            </TabsList>

            <TabsContent value="usuarios" className="flex flex-col gap-4 pt-4">
          {usersError && (
            <p className="text-sm text-destructive" role="alert">
              {usersError}
            </p>
          )}
          {usersLoading ? (
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
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        Esta organización no tiene usuarios registrados.
                      </TableCell>
                    </TableRow>
                  )}
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onClick={() => router.push(`/admin/users/${user.id}`)}
                        >
                          <div className="font-medium">{user.person.full_name}</div>
                          <div className="text-xs text-muted-foreground">@{user.username}</div>
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={user.status.code === 'ACTIVE' ? 'default' : 'secondary'}>{user.status.name}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
            </TabsContent>

            <TabsContent value="sucursales" className="flex flex-col gap-4 pt-4">
          {branchesError && (
            <p className="text-sm text-destructive" role="alert">
              {branchesError}
            </p>
          )}
          {branchesLoading ? (
            <p className="text-sm text-muted-foreground" role="status">
              Cargando…
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sucursal</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branches.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Esta organización no tiene sucursales registradas.
                      </TableCell>
                    </TableRow>
                  )}
                  {branches.map((branch) => (
                    <TableRow key={branch.id}>
                      <TableCell>
                        <div className="font-medium">{branch.name}</div>
                        <div className="text-xs text-muted-foreground">{branch.address ?? '—'}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{branch.branch_type?.name ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {[branch.municipality?.name, branch.department?.name].filter(Boolean).join(', ') || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={branch.is_active ? 'default' : 'secondary'}>
                          {branch.is_active ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
            </TabsContent>

            <TabsContent value="contactos" className="flex flex-col gap-4 pt-4">
          {contactsError && (
            <p className="text-sm text-destructive" role="alert">
              {contactsError}
            </p>
          )}
          {contactsLoading ? (
            <p className="text-sm text-muted-foreground" role="status">
              Cargando…
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Correo</TableHead>
                    <TableHead>Teléfono</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Esta organización no tiene contactos registrados.
                      </TableCell>
                    </TableRow>
                  )}
                  {contacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell>
                        <div className="font-medium">{contact.full_name}</div>
                        {contact.is_primary && <div className="text-xs text-muted-foreground">Contacto principal</div>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{contact.position_title ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{contact.email ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{contact.phone ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
