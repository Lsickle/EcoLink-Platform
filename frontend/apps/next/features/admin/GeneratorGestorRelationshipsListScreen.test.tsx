import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { GeneratorGestorRelationshipsListScreen } from './GeneratorGestorRelationshipsListScreen'

const fetchGeneratorGestorRelationshipsMock = vi.fn()
const createGeneratorGestorRelationshipMock = vi.fn()
const revokeGeneratorGestorRelationshipMock = vi.fn()
const searchOrganizationsMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchGeneratorGestorRelationships: (...args: unknown[]) => fetchGeneratorGestorRelationshipsMock(...args),
    createGeneratorGestorRelationship: (...args: unknown[]) => createGeneratorGestorRelationshipMock(...args),
    revokeGeneratorGestorRelationship: (...args: unknown[]) => revokeGeneratorGestorRelationshipMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
  }
})

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['generator_gestor_relationships.read'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function relationship(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 3,
    uuid: 'ggr-3',
    generator_organization_id: 1,
    gestor_organization_id: 5,
    authorized_by: 1,
    authorized_at: '2026-08-09T00:00:00Z',
    revoked_by: null,
    revoked_at: null,
    observations: null,
    is_active: true,
    created_at: '2026-08-09T00:00:00Z',
    updated_at: '2026-08-09T00:00:00Z',
    generator_organization: { id: 1, legal_name: 'Immetal S.A.S.' },
    gestor_organization: { id: 5, legal_name: 'EcoTrata S.A.S.' },
    ...overrides,
  }
}

describe('GeneratorGestorRelationshipsListScreen', () => {
  beforeEach(() => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: [
        'generator_gestor_relationships.read',
        'generator_gestor_relationships.create',
        'generator_gestor_relationships.revoke',
      ],
    }
    fetchGeneratorGestorRelationshipsMock.mockResolvedValue({ ...emptyPage, data: [relationship()], total: 1 })
    searchOrganizationsMock.mockResolvedValue({ ...emptyPage, data: [] })
  })

  afterEach(() => {
    fetchGeneratorGestorRelationshipsMock.mockReset()
    createGeneratorGestorRelationshipMock.mockReset()
    revokeGeneratorGestorRelationshipMock.mockReset()
    searchOrganizationsMock.mockReset()
    pushMock.mockClear()
  })

  test('renders the gestor, generator and active status badge', async () => {
    render(<GeneratorGestorRelationshipsListScreen />)

    await screen.findByText('EcoTrata S.A.S.')
    expect(screen.getByText('Immetal S.A.S.')).toBeInTheDocument()
    expect(screen.getByText('Vigente')).toBeInTheDocument()
  })

  test('revokes an active relationship', async () => {
    revokeGeneratorGestorRelationshipMock.mockResolvedValue({
      generator_gestor_relationship: relationship({ is_active: false }),
    })
    render(<GeneratorGestorRelationshipsListScreen />)
    await screen.findByText('EcoTrata S.A.S.')

    fireEvent.click(screen.getByRole('button', { name: 'Revocar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar revocación' }))

    await waitFor(() => expect(revokeGeneratorGestorRelationshipMock).toHaveBeenCalledWith(3))
  })

  test('hides "Revocar" without the revoke permission', async () => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['generator_gestor_relationships.read'] }
    render(<GeneratorGestorRelationshipsListScreen />)
    await screen.findByText('EcoTrata S.A.S.')

    expect(screen.queryByRole('button', { name: 'Revocar' })).not.toBeInTheDocument()
  })

  test('creates a relationship for a tenant Gestor (own organization, no gestor selector)', async () => {
    createGeneratorGestorRelationshipMock.mockResolvedValue({ generator_gestor_relationship: relationship() })
    render(<GeneratorGestorRelationshipsListScreen />)
    await screen.findByText('EcoTrata S.A.S.')

    fireEvent.click(screen.getByRole('button', { name: '+ Registrar Generador Cliente' }))
    expect(screen.queryByLabelText('Organización Gestor')).not.toBeInTheDocument()

    searchOrganizationsMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 9, legal_name: 'Hospital San José S.A.S.', tax_id: '900987654' }],
    })
    fireEvent.change(screen.getByLabelText('Organización Generadora'), { target: { value: 'Hospital' } })
    fireEvent.click(await screen.findByText('Hospital San José S.A.S.'))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))

    await waitFor(() =>
      expect(createGeneratorGestorRelationshipMock).toHaveBeenCalledWith(
        expect.objectContaining({ generator_organization_id: 9 })
      )
    )
  })

  test('shows an empty message when there are no relationships', async () => {
    fetchGeneratorGestorRelationshipsMock.mockResolvedValue(emptyPage)
    render(<GeneratorGestorRelationshipsListScreen />)

    expect(await screen.findByText(/No hay relaciones Generador-Gestor/)).toBeInTheDocument()
  })

  // Pedido explícito del usuario, 2026-08-11: punto de entrada a la
  // pantalla acotada del Generador vinculado (LinkedGeneratorDetailScreen).
  describe('botón "Ver detalles"', () => {
    test('navega a /admin/generators/{id} cuando el actor NO es platform staff', async () => {
      render(<GeneratorGestorRelationshipsListScreen />)
      await screen.findByText('EcoTrata S.A.S.')

      fireEvent.click(screen.getByRole('button', { name: 'Ver detalles' }))

      expect(pushMock).toHaveBeenCalledWith('/admin/generators/1')
    })

    test('navega a /admin/organizations/{id} cuando el actor SÍ es platform staff', async () => {
      currentUser = {
        id: 1,
        is_platform_staff: true,
        permissions: ['generator_gestor_relationships.read', 'generator_gestor_relationships.revoke'],
      }
      render(<GeneratorGestorRelationshipsListScreen />)
      await screen.findByText('EcoTrata S.A.S.')

      fireEvent.click(screen.getByRole('button', { name: 'Ver detalles' }))

      expect(pushMock).toHaveBeenCalledWith('/admin/organizations/1')
    })

    test('NO se muestra para una relación REVOCADA', async () => {
      fetchGeneratorGestorRelationshipsMock.mockResolvedValue({
        ...emptyPage,
        data: [relationship({ is_active: false })],
        total: 1,
      })
      render(<GeneratorGestorRelationshipsListScreen />)
      await screen.findByText('EcoTrata S.A.S.')

      expect(screen.queryByRole('button', { name: 'Ver detalles' })).not.toBeInTheDocument()
    })
  })
})
