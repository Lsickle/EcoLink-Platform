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

type BulkImportFieldDoc = {
  column: string
  required: boolean
  format: string
  notes?: string
}

// Fuente única de las 12 columnas reconocidas por `GeneratorBulkImportService`
// (backend/app/Services/GeneratorBulkImportService.php) -- alimenta la
// plantilla descargable, la tabla de referencia y el hint de columnas, para
// que las 3 no puedan desincronizarse entre sí. Verificado contra el
// backend real (REQUIRED_COLUMNS, assertValidTaxIdType(), y las migraciones
// de organizations/branches/users) al pedido del usuario, 2026-08-11.
const BULK_IMPORT_FIELDS: BulkImportFieldDoc[] = [
  {
    column: 'tax_id',
    required: true,
    format: 'Texto, máx. 30 caracteres',
    notes: 'Junto con tax_id_type identifica al Generador; si el par ya existe, esta fila solo vincula -- no se editan sus datos.',
  },
  { column: 'tax_id_type', required: true, format: 'NIT, CC, CE, Pasaporte o Tax ID' },
  { column: 'legal_name', required: true, format: 'Texto, máx. 255 caracteres', notes: 'Razón social; se ignora si el NIT ya existe.' },
  { column: 'trade_name', required: false, format: 'Texto, máx. 255 caracteres', notes: 'Nombre comercial.' },
  { column: 'organization_email', required: false, format: 'Correo electrónico' },
  { column: 'organization_phone', required: false, format: 'Texto, máx. 30 caracteres' },
  {
    column: 'username',
    required: false,
    format: 'Texto, máx. 100 caracteres, único',
    notes: 'Solo se lee de la primera fila de cada NIT nuevo; si se omite, se genera automáticamente.',
  },
  { column: 'branch_name', required: true, format: 'Texto, máx. 255 caracteres', notes: 'Nombre de la sede -- una fila = una sede.' },
  { column: 'branch_code', required: false, format: 'Texto, único por organización' },
  { column: 'branch_address', required: false, format: 'Texto libre' },
  { column: 'environmental_license', required: false, format: 'Texto, máx. 255 caracteres' },
  { column: 'license_expiration_date', required: false, format: 'Fecha AAAA-MM-DD', notes: 'Ej: 2027-12-31.' },
]

const BULK_IMPORT_EXAMPLE_ROW: Record<string, string> = {
  tax_id: '900123456-1',
  tax_id_type: 'NIT',
  legal_name: 'Generador de Ejemplo S.A.S.',
  branch_name: 'Sede Principal',
  branch_code: 'SP01',
  branch_address: 'Cra 1 #2-3, Bogotá',
}

// Escapado CSV mínimo (RFC 4180) -- necesario porque `branch_address` de
// ejemplo (y cualquier dirección/nombre real que un usuario diligencie)
// puede traer comas: sin esto, "Cra 1 #2-3, Bogotá" se parte en dos campos
// y desalinea el resto de la fila al re-subirla (mismo `fgetcsv()` del
// backend, que sí respeta comillas).
function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function downloadBulkImportTemplate() {
  const header = BULK_IMPORT_FIELDS.map((field) => csvField(field.column)).join(',')
  const example = BULK_IMPORT_FIELDS.map((field) => csvField(BULK_IMPORT_EXAMPLE_ROW[field.column] ?? '')).join(',')
  const blob = new Blob([`${header}\n${example}\n`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'plantilla-carga-masiva-generadores.csv'
  link.click()
  URL.revokeObjectURL(url)
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
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="generatorBulkImport-file">Archivo CSV</Label>
            <Button type="button" variant="outline" size="sm" onClick={downloadBulkImportTemplate}>
              Descargar plantilla CSV
            </Button>
          </div>
          <Input
            id="generatorBulkImport-file"
            type="file"
            accept=".csv,.txt,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">
            Máximo 5MB. Una fila = una sede; repite el NIT para declarar varias sedes del mismo Generador. Formato de
            cada columna abajo.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Columna</TableHead>
                <TableHead>Obligatoria</TableHead>
                <TableHead>Formato / valores válidos</TableHead>
                <TableHead>Nota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {BULK_IMPORT_FIELDS.map((field) => (
                <TableRow key={field.column}>
                  <TableCell className="font-mono text-xs">{field.column}</TableCell>
                  <TableCell>{field.required ? 'Sí' : 'No'}</TableCell>
                  <TableCell>{field.format}</TableCell>
                  <TableCell className="text-muted-foreground">{field.notes ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
