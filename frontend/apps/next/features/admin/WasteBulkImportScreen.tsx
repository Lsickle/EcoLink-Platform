'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  fetchGeneratorGestorRelationships,
  fetchGeneratorSubgestorRelationships,
  importWastesBulk,
  type WasteBulkImportResult,
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

// Fuente única de las 18 columnas reconocidas por `WasteBulkImportService`
// (backend/app/Services/WasteBulkImportService.php) -- alimenta la plantilla
// descargable, la tabla de referencia y el hint de columnas. Verificado
// contra el backend real (WasteController::validationRules(), los seeders de
// catálogos, y assertValidTaxIdType()-equivalente para cada código) al
// pedido del usuario, 2026-08-11.
const BULK_IMPORT_FIELDS: BulkImportFieldDoc[] = [
  { column: 'nombre', required: true, format: 'Texto, máx. 255 caracteres' },
  { column: 'codigo_sede', required: false, format: 'Código de una sede existente en la organización' },
  {
    column: 'codigo_categoria_residuo',
    required: false,
    format: 'INDUSTRIAL, HOSPITALARIO_Y_SIMILARES, APROVECHABLE, ORGANICO, POSCONSUMO, RCD, ESPECIAL, ORDINARIO',
  },
  {
    column: 'codigo_estado_fisico',
    required: false,
    format:
      'SOLIDO, LIQUIDO, GASEOSO, SEMISOLIDO, LODO, PASTA, GEL, AEROSOL, MEZCLA_SOLIDO_LIQUIDO, MEZCLA_LIQUIDO_LODO, POLVO, GRANULADO, CENIZA, EMULSION, SUSPENSION, NO_DETERMINADO',
  },
  { column: 'codigo_unidad_medida', required: false, format: 'KG, TON, LT, M3, LB', notes: 'Por defecto KG si se omite.' },
  { column: 'cantidad', required: false, format: 'Numérico, mayor o igual a 0' },
  { column: 'peso_promedio', required: false, format: 'Numérico, mayor o igual a 0' },
  { column: 'codigo_frecuencia_generacion', required: false, format: 'DAILY, WEEKLY, MONTHLY, OCCASIONAL' },
  { column: 'fecha_generacion', required: false, format: 'Fecha AAAA-MM-DD' },
  {
    column: 'codigos_caracteristicas_peligrosidad',
    required: false,
    format: 'COR, INF, TOX, EXP, REA, INFEC, RAD, ECO, IRR -- separados por ;',
    notes: 'Si trae alguno, la ficha de seguridad (SDS) queda marcada como obligatoria automáticamente.',
  },
  { column: 'codigos_corrientes', required: false, format: 'Códigos de Corrientes Y/A, separados por ;' },
  { column: 'codigos_un', required: false, format: 'Códigos UN, separados por ;' },
  { column: 'codigo_residuo', required: false, format: 'Texto, único por organización' },
  { column: 'descripcion', required: false, format: 'Texto libre' },
  { column: 'referencia_interna', required: false, format: 'Texto, máx. 100 caracteres' },
  { column: 'observaciones_operativas', required: false, format: 'Texto libre' },
  { column: 'requiere_transporte_especial', required: false, format: 'true / false' },
  { column: 'requiere_epp_especial', required: false, format: 'true / false' },
]

const BULK_IMPORT_EXAMPLE_ROW: Record<string, string> = {
  nombre: 'Residuo de Ejemplo',
  codigo_sede: 'SP01',
  codigo_categoria_residuo: 'INDUSTRIAL',
  codigo_estado_fisico: 'SOLIDO',
  codigo_unidad_medida: 'KG',
  cantidad: '150',
  codigos_caracteristicas_peligrosidad: 'COR;INF',
}

// Escapado CSV mínimo (RFC 4180), mismo helper que
// GeneratorBulkImportScreen.tsx -- necesario porque varios campos de texto
// libre (description, operational_notes) pueden traer comas.
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
  link.download = 'plantilla-carga-masiva-residuos.csv'
  link.click()
  URL.revokeObjectURL(url)
}

type LinkedGenerator = { id: number; legal_name: string }

/**
 * Carga Masiva de Residuos (CSV) -- pedido explícito del usuario,
 * 2026-08-11. Autoservicio para cualquier organización (Generador/
 * Subgestor/Gestor declarando sus propios residuos, sin restricción de
 * business_role -- mismo criterio que el formulario manual) o, para un
 * Subgestor/Gestor, a nombre de un Generador con relación comercial ACTIVA
 * (mismo mecanismo cross-tenant ya usado para la visibilidad de
 * organización/usuario -- `User::hasActiveGeneratorRelationshipWith()`).
 *
 * El selector "Declarar para" se puebla con
 * `fetchGeneratorSubgestorRelationships`/`fetchGeneratorGestorRelationships`
 * (`activeOnly: true`, ya existentes) en vez de un buscador genérico de
 * organizaciones -- así la UI nunca sugiere un Generador con el que el
 * actor no tiene relación. Platform staff sigue usando
 * `OrganizationSearchSelect` (capability `can_generate_waste`), igual que
 * `GeneratorBulkImportScreen.tsx`.
 *
 * Peligrosidad -> ficha de seguridad (confirmado por el usuario): el PDF en
 * sí NO se sube por este medio -- se sube después desde la pantalla de
 * Evidencias ya existente, sin bloquear esta carga masiva.
 */
export function WasteBulkImportScreen() {
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth()
  const isPlatformStaff = Boolean(user?.is_platform_staff)
  const permissions = user?.permissions ?? []
  const canImport = permissions.includes('wastes.create')

  const [linkedGenerators, setLinkedGenerators] = useState<LinkedGenerator[]>([])
  const [linkedGeneratorsLoaded, setLinkedGeneratorsLoaded] = useState(false)

  const [declareFor, setDeclareFor] = useState<'self' | 'generator'>('self')
  const [onBehalfOfId, setOnBehalfOfId] = useState<number | null>(null)
  const [onBehalfOfLabel, setOnBehalfOfLabel] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<WasteBulkImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthorized || isPlatformStaff) return
    let cancelled = false
    Promise.all([
      fetchGeneratorSubgestorRelationships({ activeOnly: true, perPage: 100 }),
      fetchGeneratorGestorRelationships({ activeOnly: true, perPage: 100 }),
    ])
      .then(([subgestorResult, gestorResult]) => {
        if (cancelled) return
        const byId = new Map<number, LinkedGenerator>()
        for (const relationship of [...subgestorResult.data, ...gestorResult.data]) {
          if (relationship.generator_organization) byId.set(relationship.generator_organization.id, relationship.generator_organization)
        }
        setLinkedGenerators(Array.from(byId.values()))
      })
      .finally(() => {
        if (!cancelled) setLinkedGeneratorsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthorized, isPlatformStaff])

  async function handleImport() {
    if (!file) return
    if (isPlatformStaff && !onBehalfOfId) {
      setError('Selecciona en nombre de qué organización se ejecuta la carga.')
      return
    }
    if (!isPlatformStaff && declareFor === 'generator' && !onBehalfOfId) {
      setError('Selecciona el Generador para el que vas a declarar residuos.')
      return
    }
    setIsImporting(true)
    setError(null)
    try {
      const importResult = await importWastesBulk(file, {
        onBehalfOfOrganizationId: isPlatformStaff || declareFor === 'generator' ? (onBehalfOfId ?? undefined) : undefined,
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
        No tiene permiso para realizar carga masiva de Residuos.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Sube un archivo CSV para declarar residuos de forma masiva. Si una fila trae características de peligrosidad,
        la ficha de seguridad queda marcada como obligatoria -- el archivo en sí se sube después desde Evidencias,
        sin bloquear esta carga.
      </p>

      <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
        {isPlatformStaff && (
          <OrganizationSearchSelect
            label="En nombre de"
            htmlId="wasteBulkImport-onBehalfOf"
            capability="can_generate_waste"
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

        {!isPlatformStaff && linkedGeneratorsLoaded && linkedGenerators.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wasteBulkImport-declareFor">Declarar para</Label>
            <select
              id="wasteBulkImport-declareFor"
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={declareFor}
              onChange={(event) => {
                const value = event.target.value as 'self' | 'generator'
                setDeclareFor(value)
                if (value === 'self') {
                  setOnBehalfOfId(null)
                  setOnBehalfOfLabel(null)
                }
              }}
            >
              <option value="self">Mis propios residuos</option>
              <option value="generator">A nombre de un Generador vinculado</option>
            </select>
          </div>
        )}

        {!isPlatformStaff && declareFor === 'generator' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wasteBulkImport-generator">Generador</Label>
            <select
              id="wasteBulkImport-generator"
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={onBehalfOfId ?? ''}
              onChange={(event) => {
                const id = Number(event.target.value)
                setOnBehalfOfId(id || null)
                setOnBehalfOfLabel(linkedGenerators.find((org) => org.id === id)?.legal_name ?? null)
              }}
            >
              <option value="">Selecciona…</option>
              {linkedGenerators.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.legal_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="wasteBulkImport-file">Archivo CSV</Label>
            <Button type="button" variant="outline" size="sm" onClick={downloadBulkImportTemplate}>
              Descargar plantilla CSV
            </Button>
          </div>
          <Input
            id="wasteBulkImport-file"
            type="file"
            accept=".csv,.txt,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">Máximo 5MB. Una fila = un residuo. Formato de cada columna abajo.</p>
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
            {isImporting ? 'Cargando…' : 'Cargar Residuos'}
          </Button>
        </div>
      </div>

      {result && (
        <div className="flex flex-col gap-3" role="status">
          <p className="text-sm">
            <strong>{result.created}</strong> residuo(s) declarado(s)
            {result.errors.length > 0 && (
              <>
                , <strong>{result.errors.length}</strong> fila(s) con error
              </>
            )}
            .
          </p>

          {result.wastes.length > 0 && (
            <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Residuo</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Sede</TableHead>
                    <TableHead>Peligrosidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.wastes.map((waste) => (
                    <TableRow key={waste.id}>
                      <TableCell>{waste.name}</TableCell>
                      <TableCell>{waste.code ?? '—'}</TableCell>
                      <TableCell>{waste.branch_name ?? '—'}</TableCell>
                      <TableCell>{waste.waste_danger ?? '—'}</TableCell>
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
