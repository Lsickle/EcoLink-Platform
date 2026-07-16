import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { WasteStreamsListScreen } from './WasteStreamsListScreen'

const fetchWasteStreamsMock = vi.fn()
const activateWasteStreamMock = vi.fn()
const deactivateWasteStreamMock = vi.fn()
const importWasteStreamsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchWasteStreams: (...args: unknown[]) => fetchWasteStreamsMock(...args),
    activateWasteStream: (...args: unknown[]) => activateWasteStreamMock(...args),
    deactivateWasteStream: (...args: unknown[]) => deactivateWasteStreamMock(...args),
    importWasteStreams: (...args: unknown[]) => importWasteStreamsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function makeWasteStream(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'ws-1',
    tenant_organization_id: null,
    code: 'Y8',
    name: 'Residuos de la producción, preparación y utilización de tintas',
    description: null,
    tipo: 'Y',
    requires_manifest: true,
    requires_special_transport: false,
    is_system: true,
    is_active: true,
    metadata: null,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

async function openMenu(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `Acciones para ${name}` }))
  return screen.findByRole('menu')
}

describe('WasteStreamsListScreen', () => {
  beforeEach(() => {
    fetchWasteStreamsMock.mockResolvedValue({
      data: [
        makeWasteStream(),
        makeWasteStream({
          id: 2,
          uuid: 'ws-2',
          code: 'A1010',
          name: 'Metales y compuestos metálicos',
          tipo: 'A',
          is_system: false,
          is_active: false,
        }),
      ],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 10,
    })
  })

  afterEach(() => {
    fetchWasteStreamsMock.mockReset()
    activateWasteStreamMock.mockReset()
    deactivateWasteStreamMock.mockReset()
    importWasteStreamsMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the waste_streams.read permission via useRequireAuth', async () => {
    render(<WasteStreamsListScreen />)
    await screen.findByText('A1010')

    expect(useRequireAuthMock).toHaveBeenCalledWith('waste_streams.read')
  })

  test('does not fetch or render the table when the user lacks waste_streams.read', () => {
    useRequireAuthMock.mockReturnValueOnce({ user: null, isLoading: false, isAuthorized: false })
    render(<WasteStreamsListScreen />)

    expect(fetchWasteStreamsMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /crear corriente/i })).not.toBeInTheDocument()
  })

  test('renders both rows with their tipo badge and origin badge', async () => {
    render(<WasteStreamsListScreen />)

    expect(await screen.findByText('A1010')).toBeInTheDocument()
    const row1 = screen.getByText('Y8').closest('tr')
    expect(within(row1 as HTMLElement).getByText('Y')).toBeInTheDocument()
    expect(within(row1 as HTMLElement).getByText('Sistema')).toBeInTheDocument()
    const row2 = screen.getByText('A1010').closest('tr')
    expect(within(row2 as HTMLElement).getByText('A')).toBeInTheDocument()
    expect(within(row2 as HTMLElement).getByText('Personalizado')).toBeInTheDocument()
  })

  test('filtering by tipo requests the selected tipo and resets to page 1', async () => {
    render(<WasteStreamsListScreen />)
    await screen.findByText('A1010')
    fetchWasteStreamsMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por tipo' }))
    const option = await screen.findByRole('option', { name: 'Y' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    expect(fetchWasteStreamsMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, tipo: 'Y' }))
  })

  test('filtering by status requests the selected status', async () => {
    render(<WasteStreamsListScreen />)
    await screen.findByText('A1010')
    fetchWasteStreamsMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }))
    const option = await screen.findByRole('option', { name: 'Inactivo' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    expect(fetchWasteStreamsMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, status: 'inactive' }))
  })

  test('navigates to /admin/waste-streams/new when clicking "+ Crear Corriente"', async () => {
    render(<WasteStreamsListScreen />)
    await screen.findByText('Y8')

    fireEvent.click(screen.getByRole('button', { name: /crear corriente/i }))

    expect(pushMock).toHaveBeenCalledWith('/admin/waste-streams/new')
  })

  test('the actions menu navigates to the detail page for "Ver" and "Editar"', async () => {
    render(<WasteStreamsListScreen />)
    await screen.findByText('A1010')

    const menu = await openMenu('Metales y compuestos metálicos')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Ver' }))
    expect(pushMock).toHaveBeenCalledWith('/admin/waste-streams/2')

    pushMock.mockClear()
    const menu2 = await openMenu('Metales y compuestos metálicos')
    fireEvent.click(within(menu2).getByRole('menuitem', { name: 'Editar' }))
    expect(pushMock).toHaveBeenCalledWith('/admin/waste-streams/2')
  })

  test('"Inactivar" calls deactivateWasteStream and updates the row badge/menu in place', async () => {
    deactivateWasteStreamMock.mockResolvedValueOnce({
      waste_stream: { ...makeWasteStream(), is_active: false },
    })
    render(<WasteStreamsListScreen />)
    await screen.findByText('Y8')

    const row = screen.getByText('Y8').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('Activo')).toBeInTheDocument()

    const menu = await openMenu('Residuos de la producción, preparación y utilización de tintas')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Inactivar' }))
    })

    expect(deactivateWasteStreamMock).toHaveBeenCalledWith(1)
    expect(within(row as HTMLElement).getByText('Inactivo')).toBeInTheDocument()
  })

  test('"Activar" calls activateWasteStream for an inactive row', async () => {
    activateWasteStreamMock.mockResolvedValueOnce({
      waste_stream: { ...makeWasteStream({ id: 2, code: 'A1010', name: 'Metales y compuestos metálicos', tipo: 'A', is_system: false }), is_active: true },
    })
    render(<WasteStreamsListScreen />)
    await screen.findByText('A1010')

    const menu = await openMenu('Metales y compuestos metálicos')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Activar' }))
    })

    expect(activateWasteStreamMock).toHaveBeenCalledWith(2)
  })

  test('shows the action error if deactivateWasteStream fails', async () => {
    deactivateWasteStreamMock.mockRejectedValueOnce(
      new ApiValidationError('Error de validación.', { waste_stream: ['No se pudo inactivar.'] })
    )
    render(<WasteStreamsListScreen />)
    await screen.findByText('Y8')

    const menu = await openMenu('Residuos de la producción, preparación y utilización de tintas')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Inactivar' }))
    })

    expect(await screen.findByText('No se pudo inactivar.')).toBeInTheDocument()
  })

  // Modal de carga masiva CSV (ImportCsvDialog, compartido con
  // UnCodesListScreen) -- éxito y error de fila.
  describe('import CSV modal', () => {
    test('opens the modal, imports a file and shows the created/updated/error summary', async () => {
      importWasteStreamsMock.mockResolvedValueOnce({
        created: 2,
        updated: 1,
        errors: [{ row: 4, message: 'Las columnas code y name son requeridas.' }],
      })
      render(<WasteStreamsListScreen />)
      await screen.findByText('Y8')

      fireEvent.click(screen.getByRole('button', { name: /importar csv/i }))
      const dialog = await screen.findByRole('dialog')

      const file = new File(['code,name,tipo\nA9999,Prueba,A'], 'corrientes.csv', { type: 'text/csv' })
      const input = within(dialog).getByLabelText('Archivo') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } })
      })

      await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: /^importar$/i }))
      })

      expect(importWasteStreamsMock).toHaveBeenCalledWith(file)
      expect(await within(dialog).findByText(/2/)).toBeInTheDocument()
      expect(within(dialog).getByText(/Fila 4: Las columnas code y name son requeridas\./)).toBeInTheDocument()
    })

    test('shows an error message if the import request itself fails', async () => {
      importWasteStreamsMock.mockRejectedValueOnce(
        new ApiValidationError('Error de validación.', { file: ['El archivo no puede superar 5MB.'] })
      )
      render(<WasteStreamsListScreen />)
      await screen.findByText('Y8')

      fireEvent.click(screen.getByRole('button', { name: /importar csv/i }))
      const dialog = await screen.findByRole('dialog')

      const file = new File(['x'.repeat(10)], 'grande.csv', { type: 'text/csv' })
      const input = within(dialog).getByLabelText('Archivo') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } })
      })
      await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: /^importar$/i }))
      })

      expect(await within(dialog).findByText('El archivo no puede superar 5MB.')).toBeInTheDocument()
    })
  })
})
