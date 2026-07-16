import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ContactDetailScreen } from './ContactDetailScreen'

const fetchContactMock = vi.fn()
const updateContactMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchContact: (...args: unknown[]) => fetchContactMock(...args),
    updateContact: (...args: unknown[]) => updateContactMock(...args),
  }
})

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['contacts.read'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

function contactDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 5,
    document_type: 'CC',
    document_number: '1000123456',
    first_name: 'Ana',
    last_name: 'García',
    email: 'ana@example.com',
    phone: '3001234567',
    has_user_account: true,
    organization_links: [
      {
        organization_contact_id: 1,
        organization_id: 10,
        organization_name: 'EcoRecicla S.A.S.',
        branch_id: 20,
        branch_name: 'Planta Norte',
        position_title: 'Gerente Ambiental',
        relationship_type: 'Empleado',
        is_primary: true,
        is_active: true,
        start_date: '2026-01-01',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        organization_contact_id: 2,
        organization_id: 11,
        organization_name: 'Gestora del Sur',
        branch_id: null,
        branch_name: null,
        position_title: null,
        relationship_type: 'Externo',
        is_primary: false,
        is_active: false,
        start_date: null,
        created_at: '2026-02-01T00:00:00Z',
      },
    ],
    ...overrides,
  }
}

describe('ContactDetailScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['contacts.read'] }
    fetchContactMock.mockResolvedValue({ person: contactDetail() })
    updateContactMock.mockResolvedValue({
      person: {
        id: 5,
        document_type: 'CC',
        document_number: '1000123456',
        first_name: 'Ana',
        last_name: 'García',
        email: 'ana@example.com',
        phone: '3001234567',
        has_user_account: true,
      },
    })
  })

  afterEach(() => {
    fetchContactMock.mockReset()
    updateContactMock.mockReset()
  })

  test('a non-platform-staff actor sees Person data read-only, without editable inputs', async () => {
    render(<ContactDetailScreen contactId={5} />)

    await screen.findByText('Ana García')
    expect(screen.queryByLabelText('Nombres')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /guardar cambios/i })).not.toBeInTheDocument()
    // El dato sigue visible, solo que como texto plano.
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
  })

  test('a platform-staff actor sees an editable form and can submit changes', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['contacts.read'] }
    render(<ContactDetailScreen contactId={5} />)

    await screen.findByText('Ana García')
    const firstNameInput = screen.getByLabelText('Nombres') as HTMLInputElement
    expect(firstNameInput).toBeInTheDocument()

    fireEvent.change(firstNameInput, { target: { value: 'Ana María' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(updateContactMock).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ first_name: 'Ana María', document_number: '1000123456' })
    )
    await screen.findByText('Cambios guardados.')
  })

  test('renders organization_links with null branch as "—" and Principal/Estado badges', async () => {
    render(<ContactDetailScreen contactId={5} />)

    await screen.findByText('EcoRecicla S.A.S.')
    const primaryRow = screen.getByText('EcoRecicla S.A.S.').closest('tr') as HTMLElement
    expect(within(primaryRow).getByText('Planta Norte')).toBeInTheDocument()
    expect(within(primaryRow).getByText('Principal')).toBeInTheDocument()
    expect(within(primaryRow).getByText('Activo')).toBeInTheDocument()

    const secondaryRow = screen.getByText('Gestora del Sur').closest('tr') as HTMLElement
    // Sede Y Cargo son ambos null en este vínculo -- 2 celdas "—".
    expect(within(secondaryRow).getAllByText('—')).toHaveLength(2)
    expect(within(secondaryRow).queryByText('Principal')).not.toBeInTheDocument()
    expect(within(secondaryRow).getByText('Revocado')).toBeInTheDocument()
  })

  test('never renders a per-row edit/revoke action for organization_links (read-only in this module)', async () => {
    render(<ContactDetailScreen contactId={5} />)

    await screen.findByText('EcoRecicla S.A.S.')
    expect(screen.queryByRole('button', { name: /revocar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument()
  })
})
