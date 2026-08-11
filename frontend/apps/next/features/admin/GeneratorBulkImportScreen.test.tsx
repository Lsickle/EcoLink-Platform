import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { GeneratorBulkImportScreen } from './GeneratorBulkImportScreen'

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
})
