'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  fetchLinkedOrganizationSummary,
  fetchOrganizationUsers,
  type AdminUser,
  type LinkedOrganizationSummary,
} from 'app/features/admin/api'
import { useRequireAuth } from 'app/provider/auth'

const PER_PAGE = 15

/**
 * Pedido explícito del usuario, 2026-08-11: pantalla de SOLO LECTURA para
 * un Subgestor/Gestor con relación comercial ACTIVA hacia este Generador
 * (punto de entrada: botón "Ver usuarios" en Generadores por Subgestor/
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

  const [organization, setOrganization] = useState<LinkedOrganizationSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError, setUsersError] = useState<string | null>(null)

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuarios</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  )
}
