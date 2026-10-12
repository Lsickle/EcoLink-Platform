import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { ContactsListScreen } from './ContactsListScreen'

const fetchContactsMock = vi.fn()
const createOrganizationContactMock = vi.fn()
const searchOrganizationsMock = vi.fn()
const fetchBranchesMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchContacts: (...args: unknown[]) => fetchContactsMock(...args),
    createOrganizationContact: (...args: unknown[]) => createOrganizationContactMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
    fetchBranches: (...args: unknown[]) => fetchBranchesMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

type TestUser = {
  id: number
  is_platform_staff: boolean
  permissions: string[]
  tenant_organization_id?: number | null
}

let currentUser: TestUser | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['contacts.read'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

const tenantAdminWithCreate: TestUser = {
  id: 1,
  is_platform_staff: false,
  permissions: ['contacts.read', 'contacts.create'],
  tenant_organization_id: 42,
}

const platformStaffWithCreate: TestUser = {
  id: 1,
  is_platform_staff: true,
  permissions: ['contacts.read', 'contacts.create'],
  tenant_organization_id: 1,
}

function contactsPage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ...emptyPage,
    data: [
      {
        id: 5,
        document_type: 'CC',
        document_number: '1000123456',
        first_name: 'Ana',
        last_name: 'García',
        email: 'ana@example.com',
        phone: '3001234567',
        has_user_account: true,
        organizations_count: 2,
      },
    ],
    total: 1,
    ...overrides,
  }
}

function fillPersonFields() {
  fireEvent.change(screen.getByLabelText('Número de Documento'), { target: { value: '123456' } })
  fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Luis' } })
  fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Pérez' } })
}

// Base UI Select solo confirma una opción NO resaltada si antes recibió
// `pointerdown` -- mismo helper ya usado en CreateBranchForm.test.tsx.
async function selectOption(option: HTMLElement) {
  await act(async () => {
    fireEvent.pointerDown(option)
    fireEvent.click(option)
  })
}

// `OrganizationSearchSelect` busca al recibir foco, con debounce real de 300ms.
async function chooseOrganization(legalName: string) {
  fireEvent.focus(screen.getByLabelText('Organización'))
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(legalName) }, { timeout: 3000 }))
}

describe('ContactsListScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['contacts.read'] }
    fetchContactsMock.mockResolvedValue(contactsPage())
    fetchBranchesMock.mockResolvedValue({ ...emptyPage, kpis: {} })
    searchOrganizationsMock.mockResolvedValue(emptyPage)
  })

  afterEach(() => {
    fetchContactsMock.mockReset()
    createOrganizationContactMock.mockReset()
    searchOrganizationsMock.mockReset()
    fetchBranchesMock.mockReset()
    pushMock.mockReset()
  })

  test('renders contacts with organizations_count badge and account status', async () => {
    render(<ContactsListScreen />)

    await screen.findByText('Ana García')
    const row = screen.getByText('Ana García').closest('tr') as HTMLElement
    expect(within(row).getByText('2 organizaciones')).toBeInTheDocument()
    expect(within(row).getByText('Sí')).toBeInTheDocument()
    expect(within(row).getByText('CC 1000123456')).toBeInTheDocument()
  })

  test('does not render "+ Crear Contacto" without the contacts.create permission', async () => {
    render(<ContactsListScreen />)
    await screen.findByText('Ana García')
    expect(screen.queryByRole('button', { name: /crear contacto/i })).not.toBeInTheDocument()
  })

  test('renders "+ Crear Contacto" when the user has the contacts.create permission', async () => {
    currentUser = tenantAdminWithCreate
    render(<ContactsListScreen />)
    await screen.findByText('Ana García')
    expect(screen.getByRole('button', { name: '+ Crear Contacto' })).toBeInTheDocument()
  })

  test('tenant admin: no organization selector, creates the contact in its own organization and reloads the list', async () => {
    currentUser = tenantAdminWithCreate
    createOrganizationContactMock.mockResolvedValueOnce({ organization_contact: { id: 1 } })
    render(<ContactsListScreen />)
    await screen.findByText('Ana García')

    fireEvent.click(screen.getByRole('button', { name: '+ Crear Contacto' }))
    expect(screen.queryByLabelText('Organización')).not.toBeInTheDocument()
    expect(searchOrganizationsMock).not.toHaveBeenCalled()

    fillPersonFields()
    fetchContactsMock.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Crear Contacto' }))

    await vi.waitFor(() => {
      expect(createOrganizationContactMock).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ document_type: 'CC', document_number: '123456', first_name: 'Luis', last_name: 'Pérez' })
      )
    })
    await vi.waitFor(() => expect(fetchContactsMock).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  test('tenant admin: offers its own branches (dual-access fetchBranches, no organization filter)', async () => {
    currentUser = tenantAdminWithCreate
    fetchBranchesMock.mockResolvedValue({ ...emptyPage, data: [{ id: 9, name: 'Planta Norte' }], kpis: {} })
    createOrganizationContactMock.mockResolvedValueOnce({ organization_contact: { id: 1 } })
    render(<ContactsListScreen />)
    await screen.findByText('Ana García')

    fireEvent.click(screen.getByRole('button', { name: '+ Crear Contacto' }))
    await vi.waitFor(() => expect(fetchBranchesMock).toHaveBeenCalledWith({ perPage: 100 }))

    fireEvent.click(screen.getByRole('combobox', { name: /sucursal/i }))
    await selectOption(await screen.findByRole('option', { name: 'Planta Norte' }))
    fillPersonFields()
    fireEvent.click(screen.getByRole('button', { name: 'Crear Contacto' }))

    await vi.waitFor(() => {
      expect(createOrganizationContactMock).toHaveBeenCalledWith(42, expect.objectContaining({ branch_id: 9 }))
    })
  })

  test('platform staff: requires choosing an organization before creating', async () => {
    currentUser = platformStaffWithCreate
    render(<ContactsListScreen />)
    await screen.findByText('Ana García')

    fireEvent.click(screen.getByRole('button', { name: '+ Crear Contacto' }))
    expect(screen.getByLabelText('Organización')).toBeInTheDocument()

    fillPersonFields()
    fireEvent.click(screen.getByRole('button', { name: 'Crear Contacto' }))

    expect(await screen.findByText('Selecciona una organización.')).toBeInTheDocument()
    expect(createOrganizationContactMock).not.toHaveBeenCalled()
  })

  test(
    'platform staff: creates the contact in the chosen organization (never its own tenant) and reloads the list',
    async () => {
      currentUser = platformStaffWithCreate
      searchOrganizationsMock.mockResolvedValue({
        ...emptyPage,
        data: [{ id: 7, legal_name: 'EcoRecicla S.A.S.', tax_id: '900123456' }],
      })
      createOrganizationContactMock.mockResolvedValueOnce({ organization_contact: { id: 1 } })
      render(<ContactsListScreen />)
      await screen.findByText('Ana García')

      fireEvent.click(screen.getByRole('button', { name: '+ Crear Contacto' }))
      await chooseOrganization('EcoRecicla S.A.S.')
      await vi.waitFor(() => expect(fetchBranchesMock).toHaveBeenCalledWith({ organizationId: 7, perPage: 100 }))

      fillPersonFields()
      fetchContactsMock.mockClear()
      fireEvent.click(screen.getByRole('button', { name: 'Crear Contacto' }))

      await vi.waitFor(() => {
        expect(createOrganizationContactMock).toHaveBeenCalledWith(7, expect.objectContaining({ document_number: '123456' }))
      })
      await vi.waitFor(() => expect(fetchContactsMock).toHaveBeenCalledTimes(1))
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    },
    15000
  )

  test(
    'platform staff: changing the organization reloads its branches and resets the chosen branch',
    async () => {
      currentUser = platformStaffWithCreate
      searchOrganizationsMock.mockResolvedValue({
        ...emptyPage,
        data: [
          { id: 7, legal_name: 'EcoRecicla S.A.S.', tax_id: '900123456' },
          { id: 8, legal_name: 'Verde Limpio S.A.', tax_id: '900999888' },
        ],
      })
      fetchBranchesMock.mockImplementation(({ organizationId }: { organizationId?: number }) =>
        Promise.resolve({
          ...emptyPage,
          data: organizationId === 7 ? [{ id: 9, name: 'Planta Norte' }] : [{ id: 20, name: 'Bodega Sur' }],
          kpis: {},
        })
      )
      createOrganizationContactMock.mockResolvedValueOnce({ organization_contact: { id: 1 } })
      render(<ContactsListScreen />)
      await screen.findByText('Ana García')

      fireEvent.click(screen.getByRole('button', { name: '+ Crear Contacto' }))
      await chooseOrganization('EcoRecicla S.A.S.')
      await vi.waitFor(() => expect(fetchBranchesMock).toHaveBeenCalledWith({ organizationId: 7, perPage: 100 }))
      fireEvent.click(screen.getByRole('combobox', { name: /sucursal/i }))
      await selectOption(await screen.findByRole('option', { name: 'Planta Norte' }))

      fireEvent.click(screen.getByRole('button', { name: 'Quitar' }))
      await chooseOrganization('Verde Limpio S.A.')
      await vi.waitFor(() => expect(fetchBranchesMock).toHaveBeenCalledWith({ organizationId: 8, perPage: 100 }))

      fillPersonFields()
      fireEvent.click(screen.getByRole('button', { name: 'Crear Contacto' }))

      await vi.waitFor(() => expect(createOrganizationContactMock).toHaveBeenCalledTimes(1))
      const [organizationId, payload] = createOrganizationContactMock.mock.calls[0]
      expect(organizationId).toBe(8)
      // La sucursal elegida era de la organización anterior -- no debe viajar.
      expect(payload.branch_id).toBeUndefined()
    },
    15000
  )

  test('shows the 422 validation error from the backend and keeps the dialog open', async () => {
    currentUser = tenantAdminWithCreate
    createOrganizationContactMock.mockRejectedValueOnce(
      new ApiValidationError('Los datos no son válidos.', { document_number: ['Ya existe una persona con ese documento.'] })
    )
    render(<ContactsListScreen />)
    await screen.findByText('Ana García')

    fireEvent.click(screen.getByRole('button', { name: '+ Crear Contacto' }))
    fillPersonFields()
    fireEvent.click(screen.getByRole('button', { name: 'Crear Contacto' }))

    expect(await screen.findByText('Ya existe una persona con ese documento.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  test('navigates to the contact detail when a row is clicked', async () => {
    render(<ContactsListScreen />)
    await screen.findByText('Ana García')

    fireEvent.click(screen.getByText('Ana García'))

    expect(pushMock).toHaveBeenCalledWith('/admin/contacts/5')
  })

  test('applies search with debounce', async () => {
    render(<ContactsListScreen />)
    await screen.findByText('Ana García')
    fetchContactsMock.mockClear()

    fireEvent.change(screen.getByLabelText('Buscar contactos'), { target: { value: 'García' } })

    await vi.waitFor(() => {
      expect(fetchContactsMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'García' }))
    })
  })

  test('shows the same list for platform staff (backend already scopes it)', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['contacts.read'] }
    render(<ContactsListScreen />)

    await screen.findByText('Ana García')
    expect(fetchContactsMock).toHaveBeenCalled()
  })
})
