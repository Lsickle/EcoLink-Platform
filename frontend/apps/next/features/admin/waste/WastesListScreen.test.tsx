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

  test('shows the full hazard characteristic name in the Peligrosidad badge, not the short waste_danger code', async () => {
    fetchWastesMock.mockResolvedValue(
      wastesPage({
        data: [
          {
            ...wastesPage().data[0],
            waste_danger: 'TOX',
            waste_danger_characteristic: { code: 'TOX', name: 'TOXICO' },
          },
        ],
      }),
    )

    render(<WastesListScreen />)

    await screen.findByText('Aceite Lubricante Usado')
    expect(screen.getByText('TOXICO')).toBeInTheDocument()
    expect(screen.queryByText('TOX')).not.toBeInTheDocument()
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

  // El label apilado encima hacía que este filtro quedara más alto que el
  // resto de la barra (todos de una sola línea) -- se oculta VISUALMENTE,
  // nunca se elimina: el placeholder ya dice "Buscar organización…", pero el
  // campo debe seguir teniendo nombre accesible.
  test('el filtro de Organización oculta el label visualmente pero lo conserva para lectores de pantalla', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['wastes.read'] }
    render(<WastesListScreen />)
    await screen.findByText('Aceite Lubricante Usado')

    const input = screen.getByLabelText('Organización')
    expect(input).toHaveAttribute('placeholder', 'Buscar organización…')
    expect(document.querySelector('label[for="wasteOrganizationFilter"]')).toHaveClass('sr-only')
  })

  test('hides the Organización column for a non-platform-staff tenant admin', async () => {
    render(<WastesListScreen />)
    await screen.findByText('Aceite Lubricante Usado')
    expect(screen.queryByRole('columnheader', { name: 'Organización' })).not.toBeInTheDocument()
  })

  // Cadena Generador -> Subgestor -> Gestor (confirmado por stakeholders reales, 2026-08-09):
  // un Subgestor ve residuos de MÁS de una organización (los suyos + los de
  // sus Generadores clientes) sin ser platform staff -- la columna debe
  // mostrarse igual, criterio data-driven (no depende de is_platform_staff).
  test('shows the Organización column for a non-platform-staff actor whose results span more than one organization', async () => {
    fetchWastesMock.mockResolvedValue(
      wastesPage({
        data: [
          { ...wastesPage().data[0], id: 20, organization_id: 1, organization: { id: 1, legal_name: 'Hospital San José' } },
          { ...wastesPage().data[0], id: 21, name: 'Residuo del Subgestor', organization_id: 5, organization: { id: 5, legal_name: 'LogVerde S.A.S.' } },
        ],
        total: 2,
      })
    )
    render(<WastesListScreen />)

    await screen.findByText('Aceite Lubricante Usado')
    expect(screen.getByRole('columnheader', { name: 'Organización' })).toBeInTheDocument()
    expect(screen.getByText('Hospital San José')).toBeInTheDocument()
    expect(screen.getByText('LogVerde S.A.S.')).toBeInTheDocument()
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

  test('filters by pending evaluation', async () => {
    render(<WastesListScreen />)
    await screen.findByText('Aceite Lubricante Usado')
    fetchWastesMock.mockClear()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Pendientes de evaluación' }))

    await vi.waitFor(() => {
      expect(fetchWastesMock).toHaveBeenCalledWith(expect.objectContaining({ pendingEvaluation: true }))
    })
  })

  // El filtro debe aplicar sobre TODO el listado, no solo sobre la página en
  // la que esté parado el usuario -- por eso al activarlo se vuelve a la
  // página 1 en la misma petición (nunca se consulta la página vieja).
  test('activar "Pendientes de evaluación" desde una página posterior vuelve a la página 1 en la misma petición', async () => {
    fetchWastesMock.mockResolvedValue(wastesPage({ total: 30, last_page: 2 }))
    render(<WastesListScreen />)
    await screen.findByText('Aceite Lubricante Usado')

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await vi.waitFor(() => expect(fetchWastesMock).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })))
    fetchWastesMock.mockClear()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Pendientes de evaluación' }))

    await vi.waitFor(() => {
      expect(fetchWastesMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pendingEvaluation: true }))
    })
    // Nunca se pide la página 2 con el filtro ya activo.
    expect(fetchWastesMock).not.toHaveBeenCalledWith(expect.objectContaining({ page: 2, pendingEvaluation: true }))
  })

  // Red de seguridad: si aun así la página queda fuera de rango (el filtro
  // deja menos páginas de las que había), la tabla no debe quedarse vacía.
  test('si la página actual queda fuera de rango, vuelve sola a la última página válida en vez de mostrar la tabla vacía', async () => {
    fetchWastesMock.mockResolvedValue(wastesPage({ total: 30, last_page: 2 }))
    render(<WastesListScreen />)
    await screen.findByText('Aceite Lubricante Usado')

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await vi.waitFor(() => expect(fetchWastesMock).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })))

    // El filtro reduce el resultado a una sola página: la página 2 ya no existe.
    fetchWastesMock.mockImplementation((params: { page?: number }) =>
      Promise.resolve(
        params.page === 1
          ? wastesPage({ total: 3, last_page: 1 })
          : { ...wastesPage({ total: 3, last_page: 1 }), data: [] },
      ),
    )
    fetchWastesMock.mockClear()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Pendientes de evaluación' }))

    await vi.waitFor(() => expect(screen.getByText('Aceite Lubricante Usado')).toBeInTheDocument())
    expect(screen.queryByText('No hay residuos que coincidan con los filtros.')).not.toBeInTheDocument()
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
