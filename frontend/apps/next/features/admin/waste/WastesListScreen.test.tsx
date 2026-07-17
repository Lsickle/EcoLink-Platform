import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WastesListScreen } from './WastesListScreen'

const fetchWastesMock = vi.fn()
const fetchWasteCategoriesMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchWastes: (...args: unknown[]) => fetchWastesMock(...args),
    fetchWasteCategories: (...args: unknown[]) => fetchWasteCategoriesMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['wastes.read'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function wastesPage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ...emptyPage,
    data: [
      {
        id: 20,
        uuid: 'waste-20',
        tenant_organization_id: 1,
        organization_id: 1,
        branch_id: null,
        waste_category_id: 1,
        code: null,
        name: 'Aceite Lubricante Usado',
        description: null,
        status: 'BR',
        waste_danger: null,
        waste_type_id: 1,
        is_template: false,
        is_preapproved: false,
        preapproved_by_organization_id: null,
        requires_characterization: false,
        requires_sds: true,
        physical_state_id: null,
        measurement_unit_id: 1,
        average_weight: null,
        generation_frequency_id: null,
        requires_special_transport: false,
        requires_special_ppe: false,
        operational_status_id: 1,
        quantity: null,
        generation_date: null,
        internal_reference: null,
        operational_notes: null,
        is_active: true,
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
        created_by: 1,
        updated_by: 1,
        waste_category: { id: 1, code: 'INDUSTRIAL', name: 'Industrial' },
      },
    ],
    total: 1,
    kpis: { total: 5, active: 3, inactive: 2 },
    ...overrides,
  }
}

describe('WastesListScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['wastes.read'] }
    fetchWastesMock.mockResolvedValue(wastesPage())
    fetchWasteCategoriesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 1, uuid: 'wc-1', code: 'INDUSTRIAL', name: 'Industrial', description: null, is_system: true, is_active: true, created_at: '', updated_at: '' }],
    })
  })

  afterEach(() => {
    fetchWastesMock.mockReset()
    fetchWasteCategoriesMock.mockReset()
    pushMock.mockReset()
  })

  test('shows the 3 real KPIs (plain object)', async () => {
    render(<WastesListScreen />)

    await screen.findByText('Aceite Lubricante Usado')
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Activos')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Inactivos')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  test('shows the eager-loaded organization per row for platform staff', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['wastes.read'] }
    fetchWastesMock.mockResolvedValue(
      wastesPage({ data: [{ ...wastesPage().data[0], organization: { id: 1, legal_name: 'Hospital San José' } }] })
    )
    render(<WastesListScreen />)

    await screen.findByText('Aceite Lubricante Usado')
    const row = screen.getByText('Aceite Lubricante Usado').closest('tr') as HTMLElement
    expect(within(row).getByText('Hospital San José')).toBeInTheDocument()
  })

  test('hides the Organización column for a non-platform-staff tenant admin', async () => {
    render(<WastesListScreen />)
    await screen.findByText('Aceite Lubricante Usado')
    expect(screen.queryByRole('columnheader', { name: 'Organización' })).not.toBeInTheDocument()
  })

  test('applies search with debounce', async () => {
    render(<WastesListScreen />)
    await screen.findByText('Aceite Lubricante Usado')
    fetchWastesMock.mockClear()

    fireEvent.change(screen.getByLabelText('Buscar residuos'), { target: { value: 'Aceite' } })

    await vi.waitFor(() => {
      expect(fetchWastesMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'Aceite' }))
    })
  })

  test('filters by declaration status', async () => {
    render(<WastesListScreen />)
    await screen.findByText('Aceite Lubricante Usado')
    fetchWastesMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por estado de declaración' }))
    const option = await screen.findByRole('option', { name: 'Declarado' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    await vi.waitFor(() => {
      expect(fetchWastesMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'DEC' }))
    })
  })

  test('navigates to /admin/wastes/new when "+ Declarar Residuo" is clicked', async () => {
    render(<WastesListScreen />)
    await screen.findByText('Aceite Lubricante Usado')

    fireEvent.click(screen.getByRole('button', { name: '+ Declarar Residuo' }))

    expect(pushMock).toHaveBeenCalledWith('/admin/wastes/new')
  })

  test('navigates to the waste detail when a row is clicked', async () => {
    render(<WastesListScreen />)
    await screen.findByText('Aceite Lubricante Usado')

    fireEvent.click(screen.getByText('Aceite Lubricante Usado'))

    expect(pushMock).toHaveBeenCalledWith('/admin/wastes/20')
  })
})
