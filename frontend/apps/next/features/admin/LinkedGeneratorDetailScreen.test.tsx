import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { LinkedGeneratorDetailScreen } from './LinkedGeneratorDetailScreen'

const fetchLinkedOrganizationSummaryMock = vi.fn()
const fetchOrganizationUsersMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchLinkedOrganizationSummary: (...args: unknown[]) => fetchLinkedOrganizationSummaryMock(...args),
    fetchOrganizationUsers: (...args: unknown[]) => fetchOrganizationUsersMock(...args),
  }
})

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('app/provider/auth', () => ({
  useRequireAuth: () => ({ isAuthorized: true, user: { id: 1 }, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function organizationSummary(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 42,
    legal_name: 'Distribuidora Ejemplo Uno S.A.S.',
    trade_name: 'Ejemplo Uno',
    tax_id: '901111111-1',
    tax_id_type: 'NIT',
    email: 'contacto@ejemplouno.com',
    phone: '6011234567',
    status: { code: 'ACT', name: 'Activa' },
    type: ['Generador'],
    primary_branch: null,
    ...overrides,
  }
}

function user(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 8,
    person: { full_name: 'Ana Gómez' },
    username: 'ana.gomez',
    email: 'ana@ejemplouno.com',
    status: { code: 'ACTIVE', name: 'Activo' },
    ...overrides,
  }
}

describe('LinkedGeneratorDetailScreen', () => {
  beforeEach(() => {
    fetchLinkedOrganizationSummaryMock.mockResolvedValue({ organization: organizationSummary() })
    fetchOrganizationUsersMock.mockResolvedValue({ ...emptyPage, data: [user()], total: 1 })
  })

  afterEach(() => {
    fetchLinkedOrganizationSummaryMock.mockReset()
    fetchOrganizationUsersMock.mockReset()
    pushMock.mockClear()
  })

  test('muestra razón social, nombre comercial, NIT y tipo de la organización', async () => {
    render(<LinkedGeneratorDetailScreen organizationId={42} />)

    await screen.findByText('Distribuidora Ejemplo Uno S.A.S.')
    expect(screen.getByText('Ejemplo Uno')).toBeInTheDocument()
    expect(screen.getByText('NIT 901111111-1')).toBeInTheDocument()
    expect(screen.getByText('Generador')).toBeInTheDocument()
  })

  test('lista los usuarios de la organización y navega a su ficha al hacer clic', async () => {
    render(<LinkedGeneratorDetailScreen organizationId={42} />)

    await screen.findByText('Ana Gómez')
    fireEvent.click(screen.getByText('Ana Gómez'))

    expect(pushMock).toHaveBeenCalledWith('/admin/users/8')
  })

  test('muestra un mensaje de error cuando el backend deniega el acceso (403)', async () => {
    fetchLinkedOrganizationSummaryMock.mockRejectedValue(new Error('No tiene acceso a esta organización.'))
    render(<LinkedGeneratorDetailScreen organizationId={42} />)

    expect(await screen.findByText('No tiene acceso a esta organización.')).toBeInTheDocument()
  })

  test('muestra un mensaje cuando la organización no tiene usuarios', async () => {
    fetchOrganizationUsersMock.mockResolvedValue(emptyPage)
    render(<LinkedGeneratorDetailScreen organizationId={42} />)

    expect(await screen.findByText('Esta organización no tiene usuarios registrados.')).toBeInTheDocument()
  })
})
