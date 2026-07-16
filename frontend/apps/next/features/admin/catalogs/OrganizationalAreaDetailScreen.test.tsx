import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { OrganizationalAreaDetailScreen } from './OrganizationalAreaDetailScreen'

const fetchOrganizationalAreaMock = vi.fn()
const fetchOrganizationalAreasMock = vi.fn()
const updateOrganizationalAreaMock = vi.fn()
const activateOrganizationalAreaMock = vi.fn()
const deactivateOrganizationalAreaMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchOrganizationalArea: (...args: unknown[]) => fetchOrganizationalAreaMock(...args),
    fetchOrganizationalAreas: (...args: unknown[]) => fetchOrganizationalAreasMock(...args),
    updateOrganizationalArea: (...args: unknown[]) => updateOrganizationalAreaMock(...args),
    activateOrganizationalArea: (...args: unknown[]) => activateOrganizationalAreaMock(...args),
    deactivateOrganizationalArea: (...args: unknown[]) => deactivateOrganizationalAreaMock(...args),
  }
})

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

type MockUser = { id: number; is_platform_staff?: boolean } | null

const useRequireAuthMock = vi.fn<
  (permission?: string) => { user: MockUser; isLoading: boolean; isAuthorized: boolean }
>()

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function makeArea(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 4,
    uuid: 'oa-4',
    organization_id: 5,
    code: 'GER-COM',
    name: 'Gerencia Comercial',
    parent_area_id: 1,
    level: 'Gerencia',
    responsible_person_id: null,
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('OrganizationalAreaDetailScreen', () => {
  beforeEach(() => {
    useRequireAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: false }, isLoading: false, isAuthorized: true })
    fetchOrganizationalAreaMock.mockResolvedValue({ organizational_area: makeArea() })
    fetchOrganizationalAreasMock.mockResolvedValue({
      data: [
        { id: 1, uuid: 'oa-1', organization_id: 5, code: 'DIR-GEN', name: 'Dirección General', parent_area_id: null, level: 'Dirección', responsible_person_id: null, is_active: true, created_at: '', updated_at: '' },
        makeArea(),
        { id: 7, uuid: 'oa-7', organization_id: 5, code: 'COORD-VTA', name: 'Coordinación de Ventas', parent_area_id: 4, level: 'Coordinación', responsible_person_id: null, is_active: true, created_at: '', updated_at: '' },
      ],
      current_page: 1,
      last_page: 1,
      total: 3,
      per_page: 200,
    })
  })

  afterEach(() => {
    fetchOrganizationalAreaMock.mockReset()
    fetchOrganizationalAreasMock.mockReset()
    updateOrganizationalAreaMock.mockReset()
    activateOrganizationalAreaMock.mockReset()
    deactivateOrganizationalAreaMock.mockReset()
    useRequireAuthMock.mockReset()
    pushMock.mockReset()
  })

  test('requires the organizational_areas.read permission via useRequireAuth', async () => {
    render(<OrganizationalAreaDetailScreen organizationalAreaId={4} />)
    await screen.findByText('Gerencia Comercial')

    expect(useRequireAuthMock).toHaveBeenCalledWith('organizational_areas.read')
  })

  test('shows the parent area and the children in the sidebar', async () => {
    render(<OrganizationalAreaDetailScreen organizationalAreaId={4} />)
    await screen.findByText('Gerencia Comercial')

    expect(screen.getByText('Dirección General')).toBeInTheDocument()
    expect(screen.getByText('Coordinación de Ventas')).toBeInTheDocument()
  })

  test('saves changes via updateOrganizationalArea', async () => {
    updateOrganizationalAreaMock.mockResolvedValueOnce({
      organizational_area: { ...makeArea(), name: 'Gerencia Comercial Nacional' },
    })
    render(<OrganizationalAreaDetailScreen organizationalAreaId={4} />)
    await screen.findByText('Gerencia Comercial')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Gerencia Comercial Nacional' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(updateOrganizationalAreaMock).toHaveBeenCalledWith(4, expect.objectContaining({ name: 'Gerencia Comercial Nacional' }))
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument()
  })

  test('toggles active status via activateOrganizationalArea/deactivateOrganizationalArea', async () => {
    deactivateOrganizationalAreaMock.mockResolvedValueOnce({ organizational_area: { ...makeArea(), is_active: false } })
    render(<OrganizationalAreaDetailScreen organizationalAreaId={4} />)
    await screen.findByText('Gerencia Comercial')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Inactivar' }))
    })

    expect(deactivateOrganizationalAreaMock).toHaveBeenCalledWith(4)
  })

  test('shows the API validation error on save failure', async () => {
    updateOrganizationalAreaMock.mockRejectedValueOnce(new ApiValidationError('Error.', { name: ['Ya existe ese nombre.'] }))
    render(<OrganizationalAreaDetailScreen organizationalAreaId={4} />)
    await screen.findByText('Gerencia Comercial')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(await screen.findByText('Ya existe ese nombre.')).toBeInTheDocument()
  })
})
