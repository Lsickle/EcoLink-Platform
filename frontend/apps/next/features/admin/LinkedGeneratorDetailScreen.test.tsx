import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { LinkedGeneratorDetailScreen } from './LinkedGeneratorDetailScreen'

const fetchLinkedOrganizationSummaryMock = vi.fn()
const fetchOrganizationUsersMock = vi.fn()
const fetchLinkedGeneratorBranchesMock = vi.fn()
const fetchLinkedGeneratorContactsMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchLinkedOrganizationSummary: (...args: unknown[]) => fetchLinkedOrganizationSummaryMock(...args),
    fetchOrganizationUsers: (...args: unknown[]) => fetchOrganizationUsersMock(...args),
    fetchLinkedGeneratorBranches: (...args: unknown[]) => fetchLinkedGeneratorBranchesMock(...args),
    fetchLinkedGeneratorContacts: (...args: unknown[]) => fetchLinkedGeneratorContactsMock(...args),
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

// Shape REDUCIDO que devuelve el backend a la contraparte vinculada: sin
// licencia ambiental ni capacidades (sedes), sin documento de identidad ni
// datos personales de más (contactos).
function branch(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 3,
    name: 'Planta Norte',
    code: 'S-001',
    branch_type: { id: 1, name: 'Operativa' },
    address: 'Calle 1 # 2-3',
    municipality: { id: 1, name: 'Bogotá' },
    department: { id: 1, name: 'Bogotá D.C.' },
    status: 'ACTIVE',
    is_active: true,
    ...overrides,
  }
}

function contact(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 11,
    full_name: 'Ana Pérez',
    position_title: 'Jefa Ambiental',
    email: 'ana@generador.test',
    phone: '3001234567',
    is_primary: true,
    link_is_active: true,
    ...overrides,
  }
}

describe('LinkedGeneratorDetailScreen', () => {
  beforeEach(() => {
    fetchLinkedOrganizationSummaryMock.mockResolvedValue({ organization: organizationSummary() })
    fetchOrganizationUsersMock.mockResolvedValue({ ...emptyPage, data: [user()], total: 1 })
    fetchLinkedGeneratorBranchesMock.mockResolvedValue({ ...emptyPage, data: [branch()], total: 1 })
    fetchLinkedGeneratorContactsMock.mockResolvedValue({ ...emptyPage, data: [contact()], total: 1 })
  })

  afterEach(() => {
    fetchLinkedOrganizationSummaryMock.mockReset()
    fetchOrganizationUsersMock.mockReset()
    fetchLinkedGeneratorBranchesMock.mockReset()
    fetchLinkedGeneratorContactsMock.mockReset()
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

  // Pedido del usuario (2026-08-14): el Gestor/Subgestor necesita ver sedes y
  // contactos del Generador vinculado para coordinar recolecciones.

  // Usuarios/Sucursales/Contactos viven en PESTAÑAS: solo la activa se
  // renderiza, así que hay que navegar para verificar el contenido.
  async function openTab(name: 'Usuarios' | 'Sucursales' | 'Contactos') {
    fireEvent.click(await screen.findByRole('tab', { name }))
  }

  test('arranca en la pestaña Usuarios y no monta el resto', async () => {
    render(<LinkedGeneratorDetailScreen organizationId={42} />)

    expect(await screen.findByText('Ana Gómez')).toBeInTheDocument()
    expect(screen.queryByText('Planta Norte')).not.toBeInTheDocument()
    expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument()
  })

  test('muestra las sucursales del Generador vinculado', async () => {
    render(<LinkedGeneratorDetailScreen organizationId={42} />)
    await openTab('Sucursales')

    expect(await screen.findByText('Planta Norte')).toBeInTheDocument()
    expect(screen.getByText('Calle 1 # 2-3')).toBeInTheDocument()
    expect(screen.getByText('Bogotá, Bogotá D.C.')).toBeInTheDocument()
    expect(fetchLinkedGeneratorBranchesMock).toHaveBeenCalledWith(42, expect.objectContaining({ perPage: 15 }))
  })

  test('muestra los contactos del Generador vinculado con cargo y medios de contacto', async () => {
    render(<LinkedGeneratorDetailScreen organizationId={42} />)
    await openTab('Contactos')

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('Jefa Ambiental')).toBeInTheDocument()
    expect(screen.getByText('ana@generador.test')).toBeInTheDocument()
    expect(screen.getByText('Contacto principal')).toBeInTheDocument()
  })

  test('un 403 en sucursales se muestra como error sin tumbar el resto de la pantalla', async () => {
    fetchLinkedGeneratorBranchesMock.mockRejectedValue(new Error('No tiene acceso a esta organización.'))

    render(<LinkedGeneratorDetailScreen organizationId={42} />)
    await openTab('Sucursales')

    expect(await screen.findByText('No tiene acceso a esta organización.')).toBeInTheDocument()
    // Cada pestaña carga por separado: un 403 en una no rompe las otras.
    await openTab('Usuarios')
    expect(await screen.findByText('Ana Gómez')).toBeInTheDocument()
  })
})
