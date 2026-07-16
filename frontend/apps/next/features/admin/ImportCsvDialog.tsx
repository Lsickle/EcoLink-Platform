'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiValidationError, type ImportResult } from 'app/features/admin/api'

type ImportCsvDialogProps = {
  /** Usado en el título del modal, ej. "corrientes Y/A", "códigos UN". */
  resourceLabel: string
  /** Encabezados esperados por el backend, ej. "code,name,tipo". */
  headersHint: string
  onImport: (file: File) => Promise<ImportResult>
  /** Refetch de la lista tras un import sin errores. */
  onImported?: () => void
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiValidationError) {
    return error.firstError('file') ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

// Modal de carga masiva compartido entre WasteStreamsListScreen/
// UnCodesListScreen (mismo contrato de respuesta {created, updated, errors}
// en ambos controllers, ver plan aprobado) -- input de archivo + resumen del
// resultado, con la lista de errores por fila si los hay (cada fila se
// procesa de forma independiente en el backend, nunca aborta el archivo
// completo).
export function ImportCsvDialog({ resourceLabel, headersHint, onImport, onImported }: ImportCsvDialogProps) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setFile(null)
      setResult(null)
      setError(null)
    }
  }

  async function handleImport() {
    if (!file) return
    setIsImporting(true)
    setError(null)
    try {
      const importResult = await onImport(file)
      setResult(importResult)
      if (importResult.errors.length === 0) {
        onImported?.()
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline">Importar CSV</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importar {resourceLabel} desde CSV</DialogTitle>
          <DialogDescription>
            Encabezados esperados: <code>{headersHint}</code>. Máximo 5MB, formato CSV/TXT.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Label htmlFor="import-csv-file">Archivo</Label>
          <Input
            id="import-csv-file"
            type="file"
            accept=".csv,.txt,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {result && (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm" role="status">
              <p>
                <strong>{result.created}</strong> creado(s), <strong>{result.updated}</strong> actualizado(s)
                {result.errors.length > 0 && (
                  <>
                    , <strong>{result.errors.length}</strong> fila(s) con error
                  </>
                )}
                .
              </p>
              {result.errors.length > 0 && (
                <ul className="flex flex-col gap-1 text-xs text-destructive" role="alert">
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
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cerrar
          </Button>
          <Button disabled={!file || isImporting} onClick={handleImport}>
            {isImporting ? 'Importando…' : 'Importar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
