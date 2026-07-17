import { render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from './app-sidebar'

// SidebarProvider depende de useIsMobile(), que usa matchMedia -- jsdom no
// lo implementa por defecto (mismo setup que nav-user.test.tsx).
beforeAll(() => {
  window.matchMedia =
    window.matchMedia ??
    ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
})

let mockUser: { username: string; email: string; permissions?: string[] } | null = null
let mockIsLoading = false

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: mockUser, isLoading: mockIsLoading, logout: vi.fn() }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

function renderSidebar() {
  return render(
    <SidebarProvider>
      <AppSidebar />
    </SidebarProvider>
  )
}

// Revisión de seguridad del lote admin/*: el grupo "Administración" y cada
// uno de sus items se muestran solo si el usuario tiene el permiso `read`
// del módulo correspondiente -- defensa en profundidad (el backend ya
// rechaza con 403 cada request).
describe('AppSidebar -- gating de "Administración" por permisos', () => {
  afterEach(() => {
    mockUser = null
    mockIsLoading = false
  })

  test('hides the whole "Administración" group when the user has none of users.read/roles.read/permissions.read', () => {
    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['some.other.permission'] }
    renderSidebar()

    expect(screen.queryByText('Administración')).not.toBeInTheDocument()
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument()
    expect(screen.queryByText('Roles')).not.toBeInTheDocument()
    expect(screen.queryByText('Permisos')).not.toBeInTheDocument()
  })

  test('shows only the item matching the permission the user actually has', () => {
    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['roles.read'] }
    renderSidebar()

    expect(screen.getByText('Administración')).toBeInTheDocument()
    expect(screen.getByText('Roles')).toBeInTheDocument()
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument()
    expect(screen.queryByText('Permisos')).not.toBeInTheDocument()
    expect(screen.queryByText('Solicitudes de Invitación')).not.toBeInTheDocument()
  })

  test('shows all items when the user has all 3 read permissions', () => {
    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['users.read', 'roles.read', 'permissions.read'] }
    renderSidebar()

    expect(screen.getByText('Usuarios')).toBeInTheDocument()
    expect(screen.getByText('Roles')).toBeInTheDocument()
    expect(screen.getByText('Permisos')).toBeInTheDocument()
    // Mecanismo de invitación (CU-006.1 modificado): mismo gate que
    // "Usuarios" (users.read), ver InvitationRequestController::index().
    expect(screen.getByText('Solicitudes de Invitación')).toBeInTheDocument()
    // Cierre de brecha del CRUD de Permisos vs. Figma: mismo gate que
    // "Permisos" (permissions.read).
    expect(screen.getByText('Matriz de Permisos')).toBeInTheDocument()
  })

  test('hides the group while the session is still loading (no flash of items)', () => {
    mockUser = null
    mockIsLoading = true
    renderSidebar()

    expect(screen.queryByText('Administración')).not.toBeInTheDocument()
  })
})

// Primer módulo real del dominio Residuos (plan aprobado) -- mismo mecanismo
// de gating por permiso ya cubierto arriba para "Administración".
describe('AppSidebar -- gating de "Residuos" por permisos', () => {
  afterEach(() => {
    mockUser = null
    mockIsLoading = false
  })

  test('hides the "Residuos" group when the user has neither waste_streams.read nor un_codes.read', () => {
    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['roles.read'] }
    renderSidebar()

    expect(screen.queryByText('Residuos')).not.toBeInTheDocument()
    expect(screen.queryByText('Corrientes Y/A')).not.toBeInTheDocument()
    expect(screen.queryByText('Códigos UN')).not.toBeInTheDocument()
  })

  test('shows only the item matching the permission the user actually has', () => {
    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['waste_streams.read'] }
    renderSidebar()

    expect(screen.getByText('Residuos')).toBeInTheDocument()
    expect(screen.getByText('Corrientes Y/A')).toBeInTheDocument()
    expect(screen.queryByText('Códigos UN')).not.toBeInTheDocument()
  })

  test('shows both items when the user has both waste_streams.read and un_codes.read', () => {
    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['waste_streams.read', 'un_codes.read'] }
    renderSidebar()

    expect(screen.getByText('Corrientes Y/A')).toBeInTheDocument()
    expect(screen.getByText('Códigos UN')).toBeInTheDocument()
  })
})

// Batch 1/3 de Catálogos Maestros (geografía en cascada + Tipos de Sede) --
// mismo mecanismo de gating por permiso ya cubierto arriba para
// "Administración"/"Residuos". `geography.read` cubre los 4 catálogos
// geográficos de una sola vez (misma Policy en los 4 controllers).
describe('AppSidebar -- gating de "Catálogos" por permisos', () => {
  afterEach(() => {
    mockUser = null
    mockIsLoading = false
  })

  test('hides the "Catálogos" group when the user has neither geography.read nor branch_types.read', () => {
    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['roles.read'] }
    renderSidebar()

    expect(screen.queryByText('Catálogos')).not.toBeInTheDocument()
    expect(screen.queryByText('Países')).not.toBeInTheDocument()
    expect(screen.queryByText('Tipos de Sucursal')).not.toBeInTheDocument()
  })

  test('shows the 4 geography items when the user has geography.read', () => {
    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['geography.read'] }
    renderSidebar()

    expect(screen.getByText('Catálogos')).toBeInTheDocument()
    expect(screen.getByText('Países')).toBeInTheDocument()
    expect(screen.getByText('Departamentos')).toBeInTheDocument()
    expect(screen.getByText('Municipios')).toBeInTheDocument()
    expect(screen.getByText('Localidades')).toBeInTheDocument()
    expect(screen.queryByText('Tipos de Sucursal')).not.toBeInTheDocument()
  })

  test('shows only "Tipos de Sucursal" when the user has branch_types.read but not geography.read', () => {
    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['branch_types.read'] }
    renderSidebar()

    expect(screen.getByText('Tipos de Sucursal')).toBeInTheDocument()
    expect(screen.queryByText('Países')).not.toBeInTheDocument()
  })

  // Batch 3/3 (último) de Catálogos Maestros -- cada uno de los 3 catálogos
  // tiene su propio permiso `.read` (mismo criterio que los catálogos RESPEL
  // del Batch 2, nunca comparten uno solo).
  test('shows only the item matching the permission the user actually has, among the Batch 3 catalogs', () => {
    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['packaging_types.read'] }
    renderSidebar()

    expect(screen.getByText('Tipos de Embalaje')).toBeInTheDocument()
    expect(screen.queryByText('Estados del Embalaje')).not.toBeInTheDocument()
    expect(screen.queryByText('Tipos de Vehículo')).not.toBeInTheDocument()
  })

  test('shows all 3 Batch 3 catalog items when the user has all 3 read permissions', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['packaging_types.read', 'packaging_conditions.read', 'vehicle_types.read'],
    }
    renderSidebar()

    expect(screen.getByText('Tipos de Embalaje')).toBeInTheDocument()
    expect(screen.getByText('Estados del Embalaje')).toBeInTheDocument()
    expect(screen.getByText('Tipos de Vehículo')).toBeInTheDocument()
  })
})
