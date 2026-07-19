import { fireEvent, render, screen, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { CreateTransportPersonnelForm } from './CreateTransportPersonnelForm'

const createTransportPersonnelMock = vi.fn()
const searchContactsMock = vi.fn()
const searchOrganizationsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createTransportPersonnel: (...args: unknown[]) => createTransportPersonnelMock(...args),
    searchContacts: (...args: unknown[]) => searchContactsMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean } | null = { id: 1, is_platform_staff: false }

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 10 }

describe('CreateTransportPersonnelForm', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false }
    searchContactsMock.mockResolvedValue(emptyPage)
    searchOrganizationsMock.mockResolvedValue(emptyPage)
  })

  afterEach(() => {
    createTransportPersonnelMock.mockReset()
    searchContactsMock.mockReset()
    searchOrganizationsMock.mockReset()
    pushMock.mockReset()
  })

  test('hides the "Organización dueña" selector for a non-platform-staff actor', async () => {
    render(<CreateTransportPersonnelForm />)
    await screen.findByLabelText('Contacto')

    expect(screen.queryByLabelText('Organización dueña')).not.toBeInTheDocument()
  })

  test('shows the "Organización dueña" selector for platform staff', async () => {
    currentUser = { id: 1, is_platform_staff: true }
    render(<CreateTransportPersonnelForm />)

    expect(await screen.findByLabelText('Organización dueña')).toBeInTheDocument()
  })

  test('requires selecting a contact before submitting', async () => {
    render(<CreateTransportPersonnelForm />)
    await screen.findByLabelText('Contacto')

    fireEvent.click(screen.getByRole('button', { name: 'Registrar Conductor' }))

    expect(await screen.findByText('Selecciona un contacto.')).toBeInTheDocument()
    expect(createTransportPersonnelMock).not.toHaveBeenCalled()
  })

  test('selecting a contact via search and submitting sends person_id and license fields', async () => {
    searchContactsMock.mockResolvedValue({
      data: [
        {
          id: 42,
          first_name: 'Juan',
          last_name: 'Pérez',
          document_number: '123456',
          email: 'juan@ecolink.test',
          position_title: 'Conductor',
        },
      ],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 10,
    })
    createTransportPersonnelMock.mockResolvedValueOnce({ transport_personnel: { id: 99 } })
    render(<CreateTransportPersonnelForm />)
    await screen.findByLabelText('Contacto')

    fireEvent.change(screen.getByLabelText('Contacto'), { target: { value: 'Juan' } })
    const option = await screen.findByText(/Juan Pérez/)
    fireEvent.click(option)

    fireEvent.change(screen.getByLabelText(/Número de Licencia/), { target: { value: 'LIC-001' } })
    fireEvent.change(screen.getByLabelText(/Categoría/), { target: { value: 'C2' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Registrar Conductor' }))
    })

    await vi.waitFor(() => expect(createTransportPersonnelMock).toHaveBeenCalled())
    expect(createTransportPersonnelMock).toHaveBeenCalledWith(
      expect.objectContaining({ person_id: 42, license_number: 'LIC-001', license_category: 'C2' })
    )
    expect(pushMock).toHaveBeenCalledWith('/admin/transport-personnel/99')
  })

  test('shows the backend validation error when the person is already registered as a driver', async () => {
    searchContactsMock.mockResolvedValue({
      data: [
        { id: 42, first_name: 'Juan', last_name: 'Pérez', document_number: '123456', email: null, position_title: null },
      ],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 10,
    })
    createTransportPersonnelMock.mockRejectedValueOnce(
      new ApiValidationError('The given data was invalid.', {
        person_id: ['Esta persona ya está registrada como conductor.'],
      })
    )
    render(<CreateTransportPersonnelForm />)
    await screen.findByLabelText('Contacto')

    fireEvent.change(screen.getByLabelText('Contacto'), { target: { value: 'Juan' } })
    fireEvent.click(await screen.findByText(/Juan Pérez/))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Registrar Conductor' }))
    })

    expect(await screen.findByText('Esta persona ya está registrada como conductor.')).toBeInTheDocument()
  })
})
