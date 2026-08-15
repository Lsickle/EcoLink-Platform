import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SubgestorGestorRelationshipsListScreen } from './SubgestorGestorRelationshipsListScreen'

const fetchSubgestorGestorRelationshipsMock = vi.fn()
const createSubgestorGestorRelationshipMock = vi.fn()
const revokeSubgestorGestorRelationshipMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchSubgestorGestorRelationships: (...args: unknown[]) => fetchSubgestorGestorRelationshipsMock(...args),
    createSubgestorGestorRelationship: (...args: unknown[]) => createSubgestorGestorRelationshipMock(...args),
    revokeSubgestorGestorRelationship: (...args: unknown[]) => revokeSubgestorGestorRelationshipMock(...args),
  }
})

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[]; tenant_organization_id?: number } | null =
  null

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser }),
  useRequireAuth: () => ({ isAuthorized: true }),
}))

function relationship(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 7,
    uuid: 'sgr-7',
    subgestor_organization_id: 2,
    gestor_organization_id: 3,
    authorized_by: 1,
    authorized_at: '2026-08-15T00:00:00Z',
    revoked_by: null,
    revoked_at: null,
    observations: null,
    is_active: true,
    created_at: '2026-08-15T00:00:00Z',
    updated_at: '2026-08-15T00:00:00Z',
    subgestor_organization: { id: 2, legal_name: 'Subgestora del Norte S.A.S.' },
    gestor_organization: { id: 3, legal_name: 'Gestor Externo S.A.S.' },
    ...overrides,
  }
}

// Vínculo Subgestor -> Gestor (Fase 2, 2026-08-15). Aquí gestiona el
// SUBGESTOR, al revés que en la relación Generador-Gestor: un Gestor de
// referencia no tiene usuarios en la plataforma.
describe('SubgestorGestorRelationshipsListScreen', () => {
  beforeEach(() => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: [
        'subgestor_gestor_relationships.read',
        'subgestor_gestor_relationships.create',
        'subgestor_gestor_relationships.revoke',
      ],
      tenant_organization_id: 2,
    }
    fetchSubgestorGestorRelationshipsMock.mockResolvedValue({
      data: [relationship()],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 15,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('lista los Gestores vinculados con su estado', async () => {
    render(<SubgestorGestorRelationshipsListScreen />)

    expect(await screen.findByText('Gestor Externo S.A.S.')).toBeInTheDocument()
    expect(screen.getByText('Subgestora del Norte S.A.S.')).toBeInTheDocument()
    expect(screen.getByText('Vigente')).toBeInTheDocument()
  })

  // Es la razón de existir de la pantalla: sin vínculo no se puede registrar
  // una evaluación en nombre de ese Gestor.
  test('explica para qué sirve el vínculo', async () => {
    render(<SubgestorGestorRelationshipsListScreen />)

    expect(await screen.findByText(/registrarles una evaluación que hayan resuelto/i)).toBeInTheDocument()
  })

  test('un tenant admin NO ve el selector de organización Subgestora', async () => {
    render(<SubgestorGestorRelationshipsListScreen />)
    await screen.findByText('Gestor Externo S.A.S.')

    fireEvent.click(screen.getByRole('button', { name: '+ Vincular Gestor' }))

    // Anti-role-smuggling: siempre vincula desde SU PROPIA organización.
    expect(await screen.findByLabelText(/Organización Gestor/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Organización Subgestora/i)).not.toBeInTheDocument()
  })

  test('el staff de EcoLink sí puede elegir la organización Subgestora', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: true,
      permissions: ['subgestor_gestor_relationships.read', 'subgestor_gestor_relationships.create'],
      tenant_organization_id: 1,
    }
    render(<SubgestorGestorRelationshipsListScreen />)
    await screen.findByText('Gestor Externo S.A.S.')

    fireEvent.click(screen.getByRole('button', { name: '+ Vincular Gestor' }))

    expect(await screen.findByLabelText(/Organización Subgestora/i)).toBeInTheDocument()
  })

  test('sin permiso de crear no se ofrece vincular', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['subgestor_gestor_relationships.read'],
      tenant_organization_id: 2,
    }
    render(<SubgestorGestorRelationshipsListScreen />)
    await screen.findByText('Gestor Externo S.A.S.')

    expect(screen.queryByRole('button', { name: '+ Vincular Gestor' })).not.toBeInTheDocument()
  })

  test('revocar pide confirmación y aclara que lo ya registrado no se pierde', async () => {
    revokeSubgestorGestorRelationshipMock.mockResolvedValue({ subgestor_gestor_relationship: relationship({ is_active: false }) })

    render(<SubgestorGestorRelationshipsListScreen />)
    await screen.findByText('Gestor Externo S.A.S.')

    fireEvent.click(screen.getByRole('button', { name: 'Revocar' }))

    expect(await screen.findByText(/no se ven afectadas y conservan su trazabilidad/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar revocación' }))

    await vi.waitFor(() => expect(revokeSubgestorGestorRelationshipMock).toHaveBeenCalledWith(7))
  })

  test('un vínculo ya revocado no ofrece revocar de nuevo', async () => {
    fetchSubgestorGestorRelationshipsMock.mockResolvedValue({
      data: [relationship({ is_active: false })],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 15,
    })

    render(<SubgestorGestorRelationshipsListScreen />)
    await screen.findByText('Gestor Externo S.A.S.')

    expect(screen.getByText('Revocado')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Revocar' })).not.toBeInTheDocument()
  })
})
