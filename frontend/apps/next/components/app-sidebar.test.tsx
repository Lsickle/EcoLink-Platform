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

  // CU-021 "Configurar Workflow" -- gateado por su propio permiso
  // `workflows.manage`, distinto de users.read/roles.read/permissions.read
  // (acceso dual: platform staff Y un admin de organización Gestor, ver
  // WorkflowPolicy -- nunca por `is_platform_staff`).
  test('shows "Workflows" only when the user has workflows.manage', () => {
    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['roles.read'] }
    renderSidebar()

    expect(screen.queryByText('Workflows')).not.toBeInTheDocument()

    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['workflows.manage'] }
    renderSidebar()

    expect(screen.getByText('Workflows')).toBeInTheDocument()
  })

  test('hides the group while the session is still loading (no flash of items)', () => {
    mockUser = null
    mockIsLoading = true
    renderSidebar()

    expect(screen.queryByText('Administración')).not.toBeInTheDocument()
  })

  // CRUD de Conductores (`transport_personnel`, cierre del GAP DE CONTRATO
  // del lote anterior de Programación Logística) -- mismo mecanismo de
  // gating individual que "Vehículos"/"Sucursales".
  test('shows "Conductores" only when the user has transport_personnel.read', () => {
    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['roles.read'] }
    renderSidebar()

    expect(screen.queryByText('Conductores')).not.toBeInTheDocument()

    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['transport_personnel.read'] }
    renderSidebar()

    expect(screen.getByText('Conductores')).toBeInTheDocument()
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

  // Núcleo del Módulo Residuos (wizard de declaración, `wastes.read`) --
  // mismo mecanismo de gating individual que "Corrientes Y/A"/"Códigos UN".
  test('shows "Residuos" (wizard de declaración) only when the user has wastes.read', () => {
    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['waste_streams.read'] }
    renderSidebar()

    expect(screen.queryByText('Residuos', { selector: 'span' })).not.toBeInTheDocument()

    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['wastes.read'] }
    renderSidebar()

    expect(screen.getByText('Residuos', { selector: 'span' })).toBeInTheDocument()
  })

  // Solicitudes de Servicio (CU-014, Fase 1b) -- mismo mecanismo de gating
  // individual que "Residuos"/"Corrientes Y/A"/"Códigos UN".
  test('shows "Solicitudes de Servicio" only when the user has service_requests.read', () => {
    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['waste_streams.read'] }
    renderSidebar()

    expect(screen.queryByText('Solicitudes de Servicio')).not.toBeInTheDocument()

    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['service_requests.read'] }
    renderSidebar()

    expect(screen.getByText('Solicitudes de Servicio')).toBeInTheDocument()
  })

  // Programación de Recolección (Módulo Programación Logística, Fase 2a) --
  // mismo mecanismo de gating individual que "Solicitudes de Servicio".
  test('shows "Programación de Recolección" only when the user has transport_schedules.read', () => {
    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['waste_streams.read'] }
    renderSidebar()

    expect(screen.queryByText('Programación de Recolección')).not.toBeInTheDocument()

    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['transport_schedules.read'] }
    renderSidebar()

    expect(screen.getByText('Programación de Recolección')).toBeInTheDocument()
  })

  // "Rutas de Transporte" (dispatch board, CU-059) -- permiso DISTINTO
  // (`transport_routes.read`) de "Programación de Recolección".
  test('shows "Rutas de Transporte" only when the user has transport_routes.read', () => {
    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['transport_schedules.read'] }
    renderSidebar()

    expect(screen.queryByText('Rutas de Transporte')).not.toBeInTheDocument()

    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['transport_routes.read'] }
    renderSidebar()

    expect(screen.getByText('Rutas de Transporte')).toBeInTheDocument()
  })

  // Módulo Manifiesto de Cargue, Fase 3 (2026-07-19) -- mismo mecanismo de
  // gating individual que "Programación de Recolección"/"Rutas de Transporte".
  test('shows "Manifiestos de Cargue" only when the user has manifest_loads.read', () => {
    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['transport_schedules.read'] }
    renderSidebar()

    expect(screen.queryByText('Manifiestos de Cargue')).not.toBeInTheDocument()

    mockUser = { username: 'ana', email: 'ana@example.com', permissions: ['manifest_loads.read'] }
    renderSidebar()

    expect(screen.getByText('Manifiestos de Cargue')).toBeInTheDocument()
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
