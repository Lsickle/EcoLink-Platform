import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { CreateOrganizationForm } from './CreateOrganizationForm'

const createOrganizationMock = vi.fn()
const fetchCountriesMock = vi.fn()
const searchOrganizationsMock = vi.fn()
const fetchBusinessRolesMock = vi.fn()
const fetchOrganizationStatusesMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createOrganization: (...args: unknown[]) => createOrganizationMock(...args),
    fetchCountries: (...args: unknown[]) => fetchCountriesMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
    fetchBusinessRoles: (...args: unknown[]) => fetchBusinessRolesMock(...args),
    fetchOrganizationStatuses: (...args: unknown[]) => fetchOrganizationStatusesMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const useRequireAuthMock = vi.fn<
  (permission?: string, options?: { requirePlatformStaff?: boolean }) => {
    user: { id: number } | null
    isLoading: boolean
    isAuthorized: boolean
  }
>(() => ({ user: { id: 1 }, isLoading: false, isAuthorized: true }))

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string, options?: { requirePlatformStaff?: boolean }) =>
    useRequireAuthMock(permission, options),
}))

describe('CreateOrganizationForm', () => {
  beforeEach(() => {
    fetchCountriesMock.mockResolvedValue({
      data: [{ id: 1, uuid: 'c-1', iso_code: 'CO', name: 'Colombia', is_active: true, created_at: '', updated_at: '' }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 300,
    })
    searchOrganizationsMock.mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 10 })
    fetchBusinessRolesMock.mockResolvedValue({
      data: [
        { id: 1, code: 'GENERATOR', name: 'Generador', description: null, sort_order: 1, is_active: true },
        { id: 2, code: 'GESTOR', name: 'Gestor', description: null, sort_order: 2, is_active: true },
      ],
    })
    fetchOrganizationStatusesMock.mockResolvedValue({
      data: [
        { id: 1, code: 'PRO', name: 'PROSPECTO', color_hex: '#3d75dc', sort_order: 1, is_active: true },
        { id: 2, code: 'ACT', name: 'ACTIVA', color_hex: '#228b33', sort_order: 2, is_active: true },
      ],
    })
  })

  afterEach(() => {
    createOrganizationMock.mockReset()
    fetchCountriesMock.mockReset()
    searchOrganizationsMock.mockReset()
    fetchBusinessRolesMock.mockReset()
    fetchOrganizationStatusesMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires platform staff via useRequireAuth, without a specific permission', async () => {
    render(<CreateOrganizationForm />)
    await screen.findByLabelText('Razón Social')

    expect(useRequireAuthMock).toHaveBeenCalledWith(undefined, { requirePlatformStaff: true })
  })

  test('does not render the form when the user is not platform staff', () => {
    useRequireAuthMock.mockReturnValueOnce({ user: null, isLoading: false, isAuthorized: false })
    render(<CreateOrganizationForm />)

    expect(screen.queryByText('Crear Organización')).not.toBeInTheDocument()
  })

  test('shows a validation error when legal_name is missing', async () => {
    render(<CreateOrganizationForm />)
    await screen.findByLabelText('Razón Social')
    // Espera a que carguen los catálogos "Tipo de Organización"/"Estado"
    // (fetchBusinessRoles/fetchOrganizationStatuses, async) -- el botón de
    // envío queda deshabilitado hasta entonces (ver catalogsLoading).
    await screen.findByRole('checkbox', { name: 'Generador' })

    fireEvent.change(screen.getByLabelText('NIT / Identificación Tributaria'), { target: { value: '900123456-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear Organización' }))

    expect(await screen.findByText('Ingresa la razón social.')).toBeInTheDocument()
    expect(createOrganizationMock).not.toHaveBeenCalled()
  })

  test('submits the form with the required fields and navigates to the new detail screen', async () => {
    createOrganizationMock.mockResolvedValueOnce({ organization: { id: 42, legal_name: 'EcoRecicla S.A.S.' } })
    render(<CreateOrganizationForm />)
    await screen.findByLabelText('Razón Social')
    await screen.findByRole('checkbox', { name: 'Generador' })

    fireEvent.change(screen.getByLabelText('Razón Social'), { target: { value: 'EcoRecicla S.A.S.' } })
    fireEvent.change(screen.getByLabelText('NIT / Identificación Tributaria'), { target: { value: '900123456-1' } })

    fireEvent.click(screen.getByRole('button', { name: 'Crear Organización' }))

    await Promise.resolve()
    expect(createOrganizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        legal_name: 'EcoRecicla S.A.S.',
        tax_id: '900123456-1',
        tax_id_type: 'NIT',
        timezone: 'America/Bogota',
        currency_code: 'COP',
      })
    )
    expect(pushMock).toHaveBeenCalledWith('/admin/organizations/42')
  })

  test('shows the backend validation error (e.g. duplicate tax_id) without navigating', async () => {
    createOrganizationMock.mockRejectedValueOnce(
      new ApiValidationError('Error de validación.', { tax_id: ['Ya existe una organización con este NIT.'] })
    )
    render(<CreateOrganizationForm />)
    await screen.findByLabelText('Razón Social')
    await screen.findByRole('checkbox', { name: 'Generador' })

    fireEvent.change(screen.getByLabelText('Razón Social'), { target: { value: 'EcoRecicla S.A.S.' } })
    fireEvent.change(screen.getByLabelText('NIT / Identificación Tributaria'), { target: { value: '900123456-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear Organización' }))

    expect(await screen.findByText('Ya existe una organización con este NIT.')).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })

  test('toggles a "Tipo de Organización" checkbox', async () => {
    render(<CreateOrganizationForm />)
    await screen.findByLabelText('Razón Social')

    const checkbox = await screen.findByRole('checkbox', { name: 'Generador' })
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
  })
})
