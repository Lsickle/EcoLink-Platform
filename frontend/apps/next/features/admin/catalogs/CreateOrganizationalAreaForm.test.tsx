import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { CreateOrganizationalAreaForm } from './CreateOrganizationalAreaForm'

const createOrganizationalAreaMock = vi.fn()
const fetchOrganizationalAreasMock = vi.fn()
const searchOrganizationsMock = vi.fn()
const searchContactsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createOrganizationalArea: (...args: unknown[]) => createOrganizationalAreaMock(...args),
    fetchOrganizationalAreas: (...args: unknown[]) => fetchOrganizationalAreasMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
    searchContacts: (...args: unknown[]) => searchContactsMock(...args),
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

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 10 }

function selectOption(triggerName: string, optionName: string) {
  fireEvent.click(screen.getByRole('combobox', { name: triggerName }))
  return screen.findByRole('option', { name: optionName })
}

describe('CreateOrganizationalAreaForm', () => {
  beforeEach(() => {
    useRequireAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: false }, isLoading: false, isAuthorized: true })
    fetchOrganizationalAreasMock.mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 200 })
    searchOrganizationsMock.mockResolvedValue(emptyPage)
    searchContactsMock.mockResolvedValue(emptyPage)
  })

  afterEach(() => {
    createOrganizationalAreaMock.mockReset()
    fetchOrganizationalAreasMock.mockReset()
    searchOrganizationsMock.mockReset()
    searchContactsMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockReset()
  })

  test('requires the organizational_areas.manage permission via useRequireAuth', () => {
    render(<CreateOrganizationalAreaForm />)

    expect(useRequireAuthMock).toHaveBeenCalledWith('organizational_areas.manage')
  })

  test('does not show an organization search selector for a non-platform-staff actor', () => {
    render(<CreateOrganizationalAreaForm />)

    expect(screen.queryByLabelText('Organización')).not.toBeInTheDocument()
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

  test('for a platform-staff actor, shows a required organization search selector', async () => {
    useRequireAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: true }, isLoading: false, isAuthorized: true })
    render(<CreateOrganizationalAreaForm />)

    expect(screen.getByLabelText('Organización')).toBeInTheDocument()
  })

  test('for a platform-staff actor, blocks submit with an error when no organization was selected', async () => {
    useRequireAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: true }, isLoading: false, isAuthorized: true })
    render(<CreateOrganizationalAreaForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'GER-COM' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Gerencia Comercial' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear área/i }))
    })

    expect(await screen.findByText(/selecciona la organización/i)).toBeInTheDocument()
    expect(createOrganizationalAreaMock).not.toHaveBeenCalled()
  })

  test('for a platform-staff actor, selecting an organization via search includes organization_id in the payload', async () => {
    useRequireAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: true }, isLoading: false, isAuthorized: true })
    searchOrganizationsMock.mockResolvedValue({
      data: [{ id: 7, legal_name: 'ACME S.A.S.', tax_id: '900123456-7' }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 10,
    })
    createOrganizationalAreaMock.mockResolvedValueOnce({ organizational_area: { id: 11, code: 'GER-COM' } })
    render(<CreateOrganizationalAreaForm />)

    fireEvent.change(screen.getByLabelText('Organización'), { target: { value: 'ACME' } })
    const option = await screen.findByText(/ACME S\.A\.S\./)
    fireEvent.click(option)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'GER-COM' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Gerencia Comercial' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear área/i }))
    })

    expect(createOrganizationalAreaMock).toHaveBeenCalledWith(expect.objectContaining({ organization_id: 7 }))
  })

  test('shows an optional Responsable search selector and omits responsible_person_id when not selected', async () => {
    createOrganizationalAreaMock.mockResolvedValueOnce({ organizational_area: { id: 9, code: 'GER-COM' } })
    render(<CreateOrganizationalAreaForm />)

    expect(screen.getByLabelText('Responsable')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'GER-COM' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Gerencia Comercial' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear área/i }))
    })

    expect(createOrganizationalAreaMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ responsible_person_id: expect.anything() })
    )
  })

  test('selecting a Responsable via search includes responsible_person_id in the payload', async () => {
    searchContactsMock.mockResolvedValue({
      data: [{ id: 42, first_name: 'Juan', last_name: 'Pérez', document_number: '123456', email: 'juan@ecolink.test' }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 10,
    })
    createOrganizationalAreaMock.mockResolvedValueOnce({ organizational_area: { id: 9, code: 'GER-COM' } })
    render(<CreateOrganizationalAreaForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'GER-COM' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Gerencia Comercial' } })

    fireEvent.change(screen.getByLabelText('Responsable'), { target: { value: 'Juan' } })
    const option = await screen.findByText(/Juan Pérez/)
    fireEvent.click(option)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear área/i }))
    })

    expect(createOrganizationalAreaMock).toHaveBeenCalledWith(expect.objectContaining({ responsible_person_id: 42 }))
  })
})
