import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { UnCodesListScreen } from './UnCodesListScreen'

const fetchUnCodesMock = vi.fn()
const activateUnCodeMock = vi.fn()
const deactivateUnCodeMock = vi.fn()
const importUnCodesMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchUnCodes: (...args: unknown[]) => fetchUnCodesMock(...args),
    activateUnCode: (...args: unknown[]) => activateUnCodeMock(...args),
    deactivateUnCode: (...args: unknown[]) => deactivateUnCodeMock(...args),
    importUnCodes: (...args: unknown[]) => importUnCodesMock(...args),
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

function makeUnCode(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'un-1',
    tenant_organization_id: null,
    code: 'UN1013',
    name: 'Dióxido de carbono',
    hazard_class: '2.2',
    packing_group: null,
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

describe('UnCodesListScreen', () => {
  beforeEach(() => {
    fetchUnCodesMock.mockResolvedValue({
      data: [
        makeUnCode(),
        makeUnCode({ id: 2, uuid: 'un-2', code: 'UN1080', name: 'Hexafluoruro de azufre', is_system: false, is_active: false }),
      ],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 10,
    })
  })

  afterEach(() => {
    fetchUnCodesMock.mockReset()
    activateUnCodeMock.mockReset()
    deactivateUnCodeMock.mockReset()
    importUnCodesMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the un_codes.read permission via useRequireAuth', async () => {
    render(<UnCodesListScreen />)
    await screen.findByText('UN1080')

    expect(useRequireAuthMock).toHaveBeenCalledWith('un_codes.read')
  })

  test('does not fetch or render the table when the user lacks un_codes.read', () => {
    useRequireAuthMock.mockReturnValueOnce({ user: null, isLoading: false, isAuthorized: false })
    render(<UnCodesListScreen />)

    expect(fetchUnCodesMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /crear código un/i })).not.toBeInTheDocument()
  })

  test('renders rows with hazard_class/packing_group columns and origin badge', async () => {
    render(<UnCodesListScreen />)

    expect(await screen.findByText('UN1080')).toBeInTheDocument()
    const row1 = screen.getByText('UN1013').closest('tr')
    expect(within(row1 as HTMLElement).getByText('2.2')).toBeInTheDocument()
    expect(within(row1 as HTMLElement).getByText('Sistema')).toBeInTheDocument()
    const row2 = screen.getByText('UN1080').closest('tr')
    expect(within(row2 as HTMLElement).getByText('—')).toBeInTheDocument() // packing_group null
  })

  test('has no "tipo" filter (exclusive to WasteStream)', async () => {
    render(<UnCodesListScreen />)
    await screen.findByText('UN1013')

    expect(screen.queryByRole('combobox', { name: 'Filtrar por tipo' })).not.toBeInTheDocument()
  })

  test('filtering by status requests the selected status', async () => {
    render(<UnCodesListScreen />)
    await screen.findByText('UN1013')
    fetchUnCodesMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }))
    const option = await screen.findByRole('option', { name: 'Inactivo' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    expect(fetchUnCodesMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, status: 'inactive' }))
  })

  test('navigates to /admin/un-codes/new when clicking "+ Crear Código UN"', async () => {
    render(<UnCodesListScreen />)
    await screen.findByText('UN1013')

    fireEvent.click(screen.getByRole('button', { name: /crear código un/i }))

    expect(pushMock).toHaveBeenCalledWith('/admin/un-codes/new')
  })

  test('the actions menu navigates to the detail page', async () => {
    render(<UnCodesListScreen />)
    await screen.findByText('UN1080')

    const menu = await openMenu('Hexafluoruro de azufre')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Ver' }))
    expect(pushMock).toHaveBeenCalledWith('/admin/un-codes/2')
  })

  test('"Inactivar" calls deactivateUnCode and updates the row badge', async () => {
    deactivateUnCodeMock.mockResolvedValueOnce({ un_code: { ...makeUnCode(), is_active: false } })
    render(<UnCodesListScreen />)
    await screen.findByText('UN1013')

    const row = screen.getByText('UN1013').closest('tr')
    const menu = await openMenu('Dióxido de carbono')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Inactivar' }))
    })

    expect(deactivateUnCodeMock).toHaveBeenCalledWith(1)
    expect(within(row as HTMLElement).getByText('Inactivo')).toBeInTheDocument()
  })

  test('shows the action error if deactivateUnCode fails', async () => {
    deactivateUnCodeMock.mockRejectedValueOnce(
      new ApiValidationError('Error de validación.', { un_code: ['No se pudo inactivar.'] })
    )
    render(<UnCodesListScreen />)
    await screen.findByText('UN1013')

    const menu = await openMenu('Dióxido de carbono')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Inactivar' }))
    })

    expect(await screen.findByText('No se pudo inactivar.')).toBeInTheDocument()
  })

  describe('import CSV modal', () => {
    test('imports a file and shows the created/updated/error summary', async () => {
      importUnCodesMock.mockResolvedValueOnce({
        created: 1,
        updated: 0,
        errors: [],
      })
      render(<UnCodesListScreen />)
      await screen.findByText('UN1013')

      fireEvent.click(screen.getByRole('button', { name: /importar csv/i }))
      const dialog = await screen.findByRole('dialog')

      const file = new File(['code,name\nUN9999,Prueba'], 'un-codes.csv', { type: 'text/csv' })
      const input = within(dialog).getByLabelText('Archivo') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } })
      })
      await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: /^importar$/i }))
      })

      expect(importUnCodesMock).toHaveBeenCalledWith(file)
      const summary = await within(dialog).findByRole('status')
      expect(summary).toHaveTextContent('1 creado(s), 0 actualizado(s).')
    })
  })
})
