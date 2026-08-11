'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  importGeneratorsBulk,
  type GeneratorBulkImportResult,
} from 'app/features/admin/api'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from './OrganizationSearchSelect'

function errorMessage(error: unknown): string {
  if (error instanceof ApiValidationError) {
    return error.firstError('file') ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

/**
 * Carga Masiva de Generadores (CSV) por Subgestor/Gestor -- autoservicio
 * confirmado por el usuario, 2026-08-11. Un archivo, una fila = una sede;
 * varias filas con el mismo NIT = varias sedes del mismo Generador. Si el
 * NIT ya existe como organización Generador, NO se tocan sus datos/sedes --
 * solo se crea/reactiva el vínculo (deduplicación confirmada por el
 * usuario, ver `GeneratorBulkImportService`).
 *
 * Sin frame de Figma -- diseño PROPUESTO. Gate manual (no `useRequireAuth`
 * con un solo permiso) porque el acceso es un OR entre dos permisos
 * distintos según el business_role de la organización actora
 * (`generator_subgestor_relationships.create` para Subgestor,
 * `generator_gestor_relationships.create` para Gestor) -- mismo criterio ya
 * usado puntualmente en `WasteDetailScreen.tsx` para gates de botón, aquí
 * aplicado al nivel de pantalla completa.
 */
export function GeneratorBulkImportScreen() {
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth()
  const isPlatformStaff = Boolean(user?.is_platform_staff)
  const permissions = user?.permissions ?? []

  const canActAsSubgestor = permissions.includes('generator_subgestor_relationships.create')
  const canActAsGestor = permissions.includes('generator_gestor_relationships.create')
  const canImport = isPlatformStaff || canActAsSubgestor || canActAsGestor

  const [onBehalfOfId, setOnBehalfOfId] = useState<number | null>(null)
  const [onBehalfOfLabel, setOnBehalfOfLabel] = useState<string | null>(null)
  const [linkAs, setLinkAs] = useState<'gestor' | 'subgestor' | ''>('')
  const [file, setFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<GeneratorBulkImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Solo se exige elegir "actuar como" explícitamente cuando el actor NO es
  // platform staff y tiene AMBAS capacidades (caso raro) -- ver mismo
  // criterio en GeneratorBulkImportController.
  const needsExplicitLinkAs = !isPlatformStaff && canActAsSubgestor && canActAsGestor

  async function handleImport() {
    if (!file) return
    if (isPlatformStaff && !onBehalfOfId) {
      setError('Selecciona en nombre de qué organización se ejecuta la carga.')
      return
    }
    if (needsExplicitLinkAs && !linkAs) {
      setError('Indica si esta carga vincula como Gestor o como Subgestor.')
      return
    }
    setIsImporting(true)
    setError(null)
    try {
      const importResult = await importGeneratorsBulk(file, {
        onBehalfOfOrganizationId: isPlatformStaff ? (onBehalfOfId ?? undefined) : undefined,
        linkAs: linkAs || undefined,
      })
      setResult(importResult)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setIsImporting(false)
    }
  }

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  if (!canImport) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        No tiene permiso para realizar carga masiva de Generadores.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Sube un archivo CSV con tus Generadores clientes y sus sedes. Si un NIT ya existe en el sistema, no se
        modifican sus datos -- solo se crea el vínculo contigo. Cada Generador nuevo recibe de inmediato un usuario
        administrador con nombre de usuario y contraseña propios.
      </p>

      <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
        {isPlatformStaff && (
          <OrganizationSearchSelect
            label="En nombre de"
            htmlId="generatorBulkImport-onBehalfOf"
            selectedId={onBehalfOfId}
            selectedLabel={onBehalfOfLabel}
            onSelect={(org) => {
              setOnBehalfOfId(org.id)
              setOnBehalfOfLabel(org.legal_name)
            }}
            onClear={() => {
              setOnBehalfOfId(null)
              setOnBehalfOfLabel(null)
            }}
          />
        )}

        {needsExplicitLinkAs && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="generatorBulkImport-linkAs">Vincular como</Label>
            <select
              id="generatorBulkImport-linkAs"
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={linkAs}
              onChange={(event) => setLinkAs(event.target.value as 'gestor' | 'subgestor' | '')}
            >
              <option value="">Selecciona…</option>
              <option value="subgestor">Subgestor</option>
              <option value="gestor">Gestor</option>
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="generatorBulkImport-file">Archivo CSV</Label>
          <Input
            id="generatorBulkImport-file"
            type="file"
            accept=".csv,.txt,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">
            Columnas: <code>tax_id,tax_id_type,legal_name,trade_name,organization_email,organization_phone,username,branch_name,branch_code,branch_address,environmental_license,license_expiration_date</code>
            . Máximo 5MB. Una fila = una sede; repite el NIT para declarar varias sedes del mismo Generador.
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div>
          <Button disabled={!file || isImporting} onClick={handleImport}>
            {isImporting ? 'Cargando…' : 'Cargar Generadores'}
          </Button>
        </div>
      </div>

      {result && (
        <div className="flex flex-col gap-3" role="status">
          <p className="text-sm">
            <strong>{result.created}</strong> Generador(es) nuevo(s), <strong>{result.linked_existing}</strong>{' '}
            vinculado(s) a organizaciones ya existentes
            {result.errors.length > 0 && (
              <>
                , <strong>{result.errors.length}</strong> fila(s) con error
              </>
            )}
            .
          </p>

          {result.generators.some((generator) => generator.user_created) && (
            <p className="text-sm font-medium text-destructive" role="alert">
              Copia las credenciales de abajo ahora mismo -- la contraseña no se vuelve a mostrar.
            </p>
          )}

          {result.generators.length > 0 && (
            <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Generador</TableHead>
                    <TableHead>NIT</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Sedes</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Contraseña temporal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.generators.map((generator) => (
                    <TableRow key={generator.organization_id}>
                      <TableCell>{generator.legal_name}</TableCell>
                      <TableCell>{generator.tax_id}</TableCell>
                      <TableCell>{generator.was_existing ? 'Vinculado (ya existía)' : 'Nuevo'}</TableCell>
                      <TableCell>{generator.branches_created}</TableCell>
                      <TableCell>{generator.username ?? '—'}</TableCell>
                      <TableCell className="font-mono">{generator.temporary_password ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {result.errors.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-destructive" role="alert">
              {result.errors.map((rowError, index) => (
                <li key={`${rowError.row}-${index}`}>
                  Fila {rowError.row}: {rowError.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
