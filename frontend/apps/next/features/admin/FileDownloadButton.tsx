'use client'

import { useState } from 'react'
import { downloadFile, type AdminFile } from 'app/features/admin/api'

// Descarga corregida (bug real, 2026-09-28): antes cada pantalla tenía su
// propio `<a href={getFileDownloadUrl(id)}>` -- navegación plana de
// navegador hacia un endpoint `auth:sanctum`, sin `Accept: application/json`
// ni manejo de error propio (le mostraba al usuario el JSON crudo del
// backend). Compartido entre `WasteDetailScreen.tsx` (evidencias/SDS/
// documentos adicionales) y `ManifestUnloadDetailScreen.tsx` (evidencias
// fotográficas del descargue) -- mismo mecanismo, no se duplica.
export function FileDownloadButton({ file }: { file: AdminFile }) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    setError(null)
    setIsDownloading(true)
    try {
      await downloadFile(file.id, file.original_filename)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isDownloading}
        onClick={handleDownload}
        className="text-primary hover:underline disabled:opacity-50"
      >
        {isDownloading ? 'Descargando…' : 'Descargar'}
      </button>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
