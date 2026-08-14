import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WasteBulkImportScreen } from './WasteBulkImportScreen'

const importWastesBulkMock = vi.fn()
const fetchGeneratorSubgestorRelationshipsMock = vi.fn()
const fetchGeneratorGestorRelationshipsMock = vi.fn()
const searchOrganizationsMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    importWastesBulk: (...args: unknown[]) => importWastesBulkMock(...args),
    fetchGeneratorSubgestorRelationships: (...args: unknown[]) => fetchGeneratorSubgestorRelationshipsMock(...args),
    fetchGeneratorGestorRelationships: (...args: unknown[]) => fetchGeneratorGestorRelationshipsMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
  }
})

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['wastes.create'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 100 }

function csvFile() {
  return new File(['nombre\nResiduo de Prueba'], 'residuos.csv', { type: 'text/csv' })
}

function bulkImportResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    created: 1,
    errors: [],
    wastes: [{ id: 9, name: 'Residuo de Prueba', code: null, branch_name: null, waste_danger: null, waste_danger_name: null }],
    ...overrides,
  }
}

describe('WasteBulkImportScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['wastes.create'] }
    fetchGeneratorSubgestorRelationshipsMock.mockResolvedValue(emptyPage)
    fetchGeneratorGestorRelationshipsMock.mockResolvedValue(emptyPage)
    searchOrganizationsMock.mockResolvedValue(emptyPage)
  })

  afterEach(() => {
    importWastesBulkMock.mockReset()
    fetchGeneratorSubgestorRelationshipsMock.mockReset()
    fetchGeneratorGestorRelationshipsMock.mockReset()
    searchOrganizationsMock.mockReset()
  })

  test('muestra un mensaje sin el permiso wastes.create', async () => {
    currentUser = { id: 1, is_platform_staff: false, permissions: [] }
    render(<WasteBulkImportScreen />)

    expect(await screen.findByText('No tiene permiso para realizar carga masiva de Residuos.')).toBeInTheDocument()
  })

  test('muestra la tabla de referencia con las 18 columnas', async () => {
    render(<WasteBulkImportScreen />)

    expect(await screen.findByRole('columnheader', { name: 'Columna' })).toBeInTheDocument()
    expect(screen.getByText('nombre')).toBeInTheDocument()
    expect(screen.getByText('codigos_caracteristicas_peligrosidad')).toBeInTheDocument()
    expect(screen.getByText('codigos_un')).toBeInTheDocument()
    // nombre es la única columna obligatoria.
    expect(screen.getAllByText('Sí')).toHaveLength(1)
  })

  test('el botón "Descargar plantilla CSV" dispara la descarga de un archivo', async () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url')
    URL.createObjectURL = createObjectURLMock
    URL.revokeObjectURL = vi.fn()
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<WasteBulkImportScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Descargar plantilla CSV' }))

    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    const blob = createObjectURLMock.mock.calls[0][0] as Blob
    expect(blob.type).toBe('text/csv;charset=utf-8;')
    expect(clickSpy).toHaveBeenCalledTimes(1)

    clickSpy.mockRestore()
  })

  test('autoservicio: sube el archivo y llama importWastesBulk sin on_behalf_of cuando no hay Generadores vinculados', async () => {
    importWastesBulkMock.mockResolvedValue(bulkImportResult())
    render(<WasteBulkImportScreen />)

    const input = await screen.findByLabelText('Archivo CSV')
    fireEvent.change(input, { target: { files: [csvFile()] } })
    fireEvent.click(screen.getByRole('button', { name: 'Cargar Residuos' }))

    await waitFor(() => expect(importWastesBulkMock).toHaveBeenCalledWith(expect.any(File), { onBehalfOfOrganizationId: undefined }))
    expect(await screen.findByText(/residuo\(s\) declarado\(s\)/)).toBeInTheDocument()
    expect(screen.getByText('Residuo de Prueba')).toBeInTheDocument()
  })

  test('la columna Peligrosidad muestra el nombre completo de la característica, no el código corto', async () => {
    importWastesBulkMock.mockResolvedValue(
      bulkImportResult({
        wastes: [{ id: 9, name: 'Residuo de Prueba', code: null, branch_name: null, waste_danger: 'TOX', waste_danger_name: 'TOXICO' }],
      }),
    )
    render(<WasteBulkImportScreen />)

    const input = await screen.findByLabelText('Archivo CSV')
    fireEvent.change(input, { target: { files: [csvFile()] } })
    fireEvent.click(screen.getByRole('button', { name: 'Cargar Residuos' }))

    expect(await screen.findByText('TOXICO')).toBeInTheDocument()
    expect(screen.queryByText('TOX')).not.toBeInTheDocument()
  })

  test('cuando hay Generadores vinculados, el selector "Declarar para" aparece y permite declarar a nombre de uno', async () => {
    fetchGeneratorSubgestorRelationshipsMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 1, generator_organization: { id: 42, legal_name: 'Distribuidora Ejemplo Uno S.A.S.' } }],
    })
    importWastesBulkMock.mockResolvedValue(bulkImportResult())

    render(<WasteBulkImportScreen />)

    fireEvent.change(await screen.findByLabelText('Declarar para'), { target: { value: 'generator' } })
    fireEvent.change(screen.getByLabelText('Generador'), { target: { value: '42' } })
    fireEvent.change(screen.getByLabelText('Archivo CSV'), { target: { files: [csvFile()] } })
    fireEvent.click(screen.getByRole('button', { name: 'Cargar Residuos' }))

    await waitFor(() => expect(importWastesBulkMock).toHaveBeenCalledWith(expect.any(File), { onBehalfOfOrganizationId: 42 }))
  })

  test('platform staff exige seleccionar una organización antes de importar', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['wastes.create'] }

    render(<WasteBulkImportScreen />)

    fireEvent.change(await screen.findByLabelText('Archivo CSV'), { target: { files: [csvFile()] } })
    fireEvent.click(screen.getByRole('button', { name: 'Cargar Residuos' }))

    expect(await screen.findByText('Selecciona en nombre de qué organización se ejecuta la carga.')).toBeInTheDocument()
    expect(importWastesBulkMock).not.toHaveBeenCalled()
  })

  test('muestra los errores por fila devueltos por el backend', async () => {
    importWastesBulkMock.mockResolvedValue(
      bulkImportResult({ created: 0, wastes: [], errors: [{ row: 2, message: "'XYZ' no es un valor válido para codigo_categoria_residuo." }] })
    )
    render(<WasteBulkImportScreen />)

    fireEvent.change(await screen.findByLabelText('Archivo CSV'), { target: { files: [csvFile()] } })
    fireEvent.click(screen.getByRole('button', { name: 'Cargar Residuos' }))

    expect(await screen.findByText(/Fila 2:/)).toBeInTheDocument()
  })
})
