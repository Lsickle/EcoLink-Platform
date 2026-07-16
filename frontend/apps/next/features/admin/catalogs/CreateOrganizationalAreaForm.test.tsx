import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { CreateOrganizationalAreaForm } from './CreateOrganizationalAreaForm'

const createOrganizationalAreaMock = vi.fn()
const fetchOrganizationalAreasMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createOrganizationalArea: (...args: unknown[]) => createOrganizationalAreaMock(...args),
    fetchOrganizationalAreas: (...args: unknown[]) => fetchOrganizationalAreasMock(...args),
  }
})

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

function selectOption(triggerName: string, optionName: string) {
  fireEvent.click(screen.getByRole('combobox', { name: triggerName }))
  return screen.findByRole('option', { name: optionName })
}

describe('CreateOrganizationalAreaForm', () => {
  beforeEach(() => {
    useRequireAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: false }, isLoading: false, isAuthorized: true })
    fetchOrganizationalAreasMock.mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 200 })
  })

  afterEach(() => {
    createOrganizationalAreaMock.mockReset()
    fetchOrganizationalAreasMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockReset()
  })

  test('requires the organizational_areas.manage permission via useRequireAuth', () => {
    render(<CreateOrganizationalAreaForm />)

    expect(useRequireAuthMock).toHaveBeenCalledWith('organizational_areas.manage')
  })

  test('does not show an organization id field for a non-platform-staff actor', () => {
    render(<CreateOrganizationalAreaForm />)

    expect(screen.queryByLabelText(/id de organización/i)).not.toBeInTheDocument()
  })

  test('shows validation errors when submitting without required fields', async () => {
    render(<CreateOrganizationalAreaForm />)

    fireEvent.click(screen.getByRole('button', { name: /crear área/i }))

    expect(await screen.findByText('Ingresa un código.')).toBeInTheDocument()
    expect(screen.getByText('Ingresa un nombre.')).toBeInTheDocument()
    expect(createOrganizationalAreaMock).not.toHaveBeenCalled()
  })

  test('submits the payload with the selected level and navigates to the detail page', async () => {
    createOrganizationalAreaMock.mockResolvedValueOnce({ organizational_area: { id: 9, code: 'GER-COM' } })
    render(<CreateOrganizationalAreaForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'GER-COM' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Gerencia Comercial' } })

    const option = await selectOption('Nivel', 'Dirección')
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear área/i }))
    })

    expect(createOrganizationalAreaMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'GER-COM', name: 'Gerencia Comercial', level: 'Dirección' })
    )
    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/organizational-areas/9')
  })

  test('shows the API validation error on submit failure', async () => {
    createOrganizationalAreaMock.mockRejectedValueOnce(
      new ApiValidationError('Error de validación.', { code: ['Ya existe ese código.'] })
    )
    render(<CreateOrganizationalAreaForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'GER-COM' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Gerencia Comercial' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear área/i }))
    })

    expect(await screen.findByText('Ya existe ese código.')).toBeInTheDocument()
  })

  test('for a platform-staff actor, shows an organization id field and includes it in the payload', async () => {
    useRequireAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: true }, isLoading: false, isAuthorized: true })
    createOrganizationalAreaMock.mockResolvedValueOnce({ organizational_area: { id: 11, code: 'GER-COM' } })
    render(<CreateOrganizationalAreaForm />)

    expect(screen.getByLabelText(/id de organización/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/id de organización/i), { target: { value: '7' } })
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'GER-COM' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Gerencia Comercial' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear área/i }))
    })

    expect(createOrganizationalAreaMock).toHaveBeenCalledWith(expect.objectContaining({ organization_id: 7 }))
  })
})
