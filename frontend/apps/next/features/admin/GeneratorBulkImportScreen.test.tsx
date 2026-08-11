import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { GeneratorBulkImportScreen } from './GeneratorBulkImportScreen'

function splitCsvLine(line: string): string[] {
  const fields = line.split(',')
  const merged: string[] = []
  for (const field of fields) {
    const isContinuation = merged.length > 0 && (merged[merged.length - 1].match(/"/g)?.length ?? 0) % 2 === 1
    if (isContinuation) {
      merged[merged.length - 1] += `,${field}`
    } else {
      merged.push(field)
    }
  }
  return merged
}

const importGeneratorsBulkMock = vi.fn()
const searchOrganizationsMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    importGeneratorsBulk: (...args: unknown[]) => importGeneratorsBulkMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
  }
})

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['generator_subgestor_relationships.create'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

function csvFile() {
  return new File(['tax_id,tax_id_type,legal_name,branch_name\n900111222,NIT,Generador X,Sede Principal'], 'generadores.csv', {
    type: 'text/csv',
  })
}

function bulkImportResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    created: 1,
    linked_existing: 0,
    errors: [],
    generators: [
      {
        organization_id: 5,
        legal_name: 'Generador X',
        tax_id: '900111222',
        was_existing: false,
        branches_created: 1,
        user_created: true,
        username: 'generador.x',
        temporary_password: 'aB3$xyz9Kq7L',
      },
    ],
    ...overrides,
  }
}

describe('GeneratorBulkImportScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['generator_subgestor_relationships.create'] }
    importGeneratorsBulkMock.mockResolvedValue(bulkImportResult())
    searchOrganizationsMock.mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 10 })
  })

  afterEach(() => {
    importGeneratorsBulkMock.mockReset()
    searchOrganizationsMock.mockReset()
  })

  test('muestra mensaje de acceso denegado sin ninguno de los dos permisos', () => {
    currentUser = { id: 1, is_platform_staff: false, permissions: [] }
    render(<GeneratorBulkImportScreen />)

    expect(screen.getByText(/No tiene permiso para realizar carga masiva/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Archivo CSV')).not.toBeInTheDocument()
  })

  test('no muestra el selector "En nombre de" para un tenant admin (Subgestor)', () => {
    render(<GeneratorBulkImportScreen />)

    expect(screen.queryByLabelText('En nombre de')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Archivo CSV')).toBeInTheDocument()
  })

  test('muestra el selector "En nombre de" para platform staff', () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: [] }
    render(<GeneratorBulkImportScreen />)

    expect(screen.getByLabelText('En nombre de')).toBeInTheDocument()
  })

  test('el botón de carga queda deshabilitado sin archivo seleccionado', () => {
    render(<GeneratorBulkImportScreen />)

    expect(screen.getByRole('button', { name: 'Cargar Generadores' })).toBeDisabled()
  })

  test('sube el archivo y muestra el resultado con las credenciales del Generador nuevo', async () => {
    render(<GeneratorBulkImportScreen />)

    fireEvent.change(screen.getByLabelText('Archivo CSV'), { target: { files: [csvFile()] } })
    fireEvent.click(screen.getByRole('button', { name: 'Cargar Generadores' }))

    await waitFor(() => expect(importGeneratorsBulkMock).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({})))

    expect(await screen.findByText('Generador X')).toBeInTheDocument()
    expect(screen.getByText('900111222')).toBeInTheDocument()
    expect(screen.getByText('generador.x')).toBeInTheDocument()
    expect(screen.getByText('aB3$xyz9Kq7L')).toBeInTheDocument()
    expect(screen.getByText(/Copia las credenciales de abajo ahora mismo/)).toBeInTheDocument()
  })

  test('muestra "Vinculado (ya existía)" y sin credenciales cuando el Generador ya existía y ya tenía usuario', async () => {
    importGeneratorsBulkMock.mockResolvedValue(
      bulkImportResult({
        created: 0,
        linked_existing: 1,
        generators: [
          {
            organization_id: 9,
            legal_name: 'Generador Existente',
            tax_id: '900999888',
            was_existing: true,
            branches_created: 0,
            user_created: false,
            username: null,
            temporary_password: null,
          },
        ],
      })
    )

    render(<GeneratorBulkImportScreen />)
    fireEvent.change(screen.getByLabelText('Archivo CSV'), { target: { files: [csvFile()] } })
    fireEvent.click(screen.getByRole('button', { name: 'Cargar Generadores' }))

    expect(await screen.findByText('Vinculado (ya existía)')).toBeInTheDocument()
    expect(screen.queryByText(/Copia las credenciales de abajo ahora mismo/)).not.toBeInTheDocument()
  })

  test('muestra la lista de errores por fila', async () => {
    importGeneratorsBulkMock.mockResolvedValue(
      bulkImportResult({ created: 0, linked_existing: 0, generators: [], errors: [{ row: 2, message: 'NIT inválido.' }] })
    )

    render(<GeneratorBulkImportScreen />)
    fireEvent.change(screen.getByLabelText('Archivo CSV'), { target: { files: [csvFile()] } })
    fireEvent.click(screen.getByRole('button', { name: 'Cargar Generadores' }))

    expect(await screen.findByText('Fila 2: NIT inválido.')).toBeInTheDocument()
  })

  // Plantilla CSV descargable + tabla de referencia de campos (pedido por
  // el usuario, 2026-08-11) -- fuente única BULK_IMPORT_FIELDS en el
  // componente, ver su docblock.
  describe('plantilla descargable y tabla de referencia de campos', () => {
    test('muestra la tabla de referencia con las 12 columnas y su Obligatorio/valores válidos correctos', () => {
      render(<GeneratorBulkImportScreen />)

      expect(screen.getByRole('columnheader', { name: 'Columna' })).toBeInTheDocument()
      expect(screen.getByText('tax_id')).toBeInTheDocument()
      expect(screen.getByText('NIT, CC, CE, Pasaporte o Tax ID')).toBeInTheDocument()
      expect(screen.getByText('branch_name')).toBeInTheDocument()
      expect(screen.getByText('license_expiration_date')).toBeInTheDocument()
      // tax_id, tax_id_type, legal_name, branch_name son las 4 obligatorias.
      expect(screen.getAllByText('Sí')).toHaveLength(4)
    })

    test('el botón "Descargar plantilla CSV" dispara la descarga de un archivo con encabezado + fila de ejemplo', () => {
      const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url')
      const revokeObjectURLMock = vi.fn()
      // jsdom no implementa createObjectURL/revokeObjectURL.
      URL.createObjectURL = createObjectURLMock
      URL.revokeObjectURL = revokeObjectURLMock
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

      render(<GeneratorBulkImportScreen />)
      fireEvent.click(screen.getByRole('button', { name: 'Descargar plantilla CSV' }))

      expect(createObjectURLMock).toHaveBeenCalledTimes(1)
      const blob = createObjectURLMock.mock.calls[0][0] as Blob
      expect(blob.type).toBe('text/csv;charset=utf-8;')
      expect(clickSpy).toHaveBeenCalledTimes(1)
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url')

      clickSpy.mockRestore()
    })

    test('escapa correctamente los campos con comas (RFC 4180) para no desalinear el CSV', async () => {
      const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url')
      URL.createObjectURL = createObjectURLMock
      URL.revokeObjectURL = vi.fn()
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

      render(<GeneratorBulkImportScreen />)
      fireEvent.click(screen.getByRole('button', { name: 'Descargar plantilla CSV' }))

      const blob = createObjectURLMock.mock.calls[0][0] as Blob
      const text = await blob.text()
      const [, exampleLine] = text.trim().split('\n')
      const fields = splitCsvLine(exampleLine)

      expect(fields).toHaveLength(12)
      expect(exampleLine).toContain('"Cra 1 #2-3, Bogotá"')

      clickSpy.mockRestore()
    })
  })
})
