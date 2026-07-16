import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ContactsListScreen } from './ContactsListScreen'

const fetchContactsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchContacts: (...args: unknown[]) => fetchContactsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['contacts.read'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

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

describe('ContactsListScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['contacts.read'] }
    fetchContactsMock.mockResolvedValue(contactsPage())
  })

  afterEach(() => {
    fetchContactsMock.mockReset()
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

  test('does not render a "+ Crear Contacto" button (creation happens from an organization/branch context)', async () => {
    render(<ContactsListScreen />)
    await screen.findByText('Ana García')
    expect(screen.queryByRole('button', { name: /crear contacto/i })).not.toBeInTheDocument()
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
