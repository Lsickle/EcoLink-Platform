import { act, fireEvent, render, screen } from '@testing-library/react'
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

type MockUser = {
  username: string
  email: string
  permissions?: string[]
  is_platform_staff?: boolean
  organization_enabled_sidebar_modules?: string[]
}

let mockUser: MockUser | null = null
let mockIsLoading = false
// Un grupo arranca plegado salvo que la ruta actual pertenezca a él (ver
// nav-main.tsx) -- por defecto "/" no matchea ningún ítem de admin, así que
// los tests que verifican ítems DENTRO de un grupo deben fijar esta ruta a
// una url de ese grupo antes de renderizar, o el contenido no estará en el
// DOM (mismo criterio ya usado para `usePathname` mutable en
// provider/auth/AuthProvider.test.tsx).
let mockPathname = '/'

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: mockUser, isLoading: mockIsLoading, logout: vi.fn() }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => mockPathname,
}))

function renderSidebar() {
  return render(
    <SidebarProvider>
      <AppSidebar />
    </SidebarProvider>
  )
}

afterEach(() => {
  mockUser = null
  mockIsLoading = false
  mockPathname = '/'
})

// Reorganización del sidebar en 7 grupos temáticos (2026-09-28) -- filtrado
// de DOS capas: (a) la organización debe tener el módulo habilitado
// (`organization_enabled_sidebar_modules`, dato nuevo del backend) Y (b) el
// usuario debe tener al menos uno de los permisos de algún ítem del grupo
// (filtrado por permiso, sin cambios de lógica respecto al mecanismo previo).
describe('AppSidebar -- filtrado de dos capas (módulo habilitado + permiso)', () => {
  test('(a) módulo NO habilitado para la organización + usuario CON permisos del grupo -> grupo oculto', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['users.read', 'roles.read', 'permissions.read'],
      organization_enabled_sidebar_modules: [],
    }
    renderSidebar()

    expect(screen.queryByText('Administración')).not.toBeInTheDocument()
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument()
  })

  test('(b) módulo habilitado para la organización + usuario SIN ningún permiso del grupo -> grupo oculto', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['some.other.permission'],
      organization_enabled_sidebar_modules: ['ADMINISTRACION'],
    }
    renderSidebar()

    expect(screen.queryByText('Administración')).not.toBeInTheDocument()
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument()
  })

  test('(c) módulo habilitado + usuario con permiso del grupo -> grupo visible', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['users.read'],
      organization_enabled_sidebar_modules: ['ADMINISTRACION'],
    }
    mockPathname = '/admin/users'
    renderSidebar()

    expect(screen.getByText('Administración')).toBeInTheDocument()
    expect(screen.getByText('Usuarios')).toBeInTheDocument()
    // Solicitudes de Invitación comparte el mismo permiso `users.read`.
    expect(screen.getByText('Solicitudes de Invitación')).toBeInTheDocument()
    // Roles/Permisos no deben aparecer -- el usuario no tiene esos permisos.
    expect(screen.queryByText('Roles')).not.toBeInTheDocument()
  })

  test('(d) is_platform_staff bypasa el chequeo de módulo aunque organization_enabled_sidebar_modules esté vacío', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['users.read'],
      is_platform_staff: true,
      organization_enabled_sidebar_modules: [],
    }
    mockPathname = '/admin/users'
    renderSidebar()

    expect(screen.getByText('Administración')).toBeInTheDocument()
    expect(screen.getByText('Usuarios')).toBeInTheDocument()
  })

  test('sin organization_enabled_sidebar_modules (undefined, ej. sin organización) se trata como []: grupo oculto', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['users.read', 'wastes.read'],
    }
    renderSidebar()

    expect(screen.queryByText('Administración')).not.toBeInTheDocument()
    expect(screen.queryByText('Residuos', { selector: 'span' })).not.toBeInTheDocument()
  })

  test('hides every group while the session is still loading (no flash of items)', () => {
    mockUser = null
    mockIsLoading = true
    renderSidebar()

    expect(screen.queryByText('Administración')).not.toBeInTheDocument()
    expect(screen.queryByText('Residuos', { selector: 'span' })).not.toBeInTheDocument()
  })

  test('el grupo "Certificados" nunca se muestra -- todavía no tiene ítems', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['users.read', 'roles.read', 'permissions.read', 'workflows.manage'],
      is_platform_staff: true,
      organization_enabled_sidebar_modules: ['CERTIFICADOS', 'ADMINISTRACION'],
    }
    renderSidebar()

    expect(screen.queryByText('Certificados')).not.toBeInTheDocument()
  })

  test('"Inicio" y "Plataforma" quedan fuera del mecanismo de 2 capas', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      is_platform_staff: true,
      organization_enabled_sidebar_modules: [],
    }
    mockPathname = '/admin/organizations'
    renderSidebar()

    expect(screen.getByText('Inicio')).toBeInTheDocument()
    expect(screen.getByText('Organizaciones')).toBeInTheDocument()
  })
})

describe('AppSidebar -- grupo "Organización"', () => {
  test('muestra solo los ítems cuyo permiso tiene el usuario', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['branches.read', 'geography.read'],
      organization_enabled_sidebar_modules: ['ORGANIZACION'],
    }
    mockPathname = '/admin/branches'
    renderSidebar()

    expect(screen.getByText('Organización')).toBeInTheDocument()
    expect(screen.getByText('Sucursales')).toBeInTheDocument()
    expect(screen.getByText('Países')).toBeInTheDocument()
    expect(screen.getByText('Departamentos')).toBeInTheDocument()
    expect(screen.queryByText('Contactos')).not.toBeInTheDocument()
    // Vehículos ahora vive en "Logística", no en "Organización".
    expect(screen.queryByText('Vehículos')).not.toBeInTheDocument()
  })

  test('"Carga Masiva de Generadores" es visible con CUALQUIERA de sus dos permisos (OR)', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['generator_gestor_relationships.create'],
      organization_enabled_sidebar_modules: ['ORGANIZACION'],
    }
    mockPathname = '/admin/generators/bulk-import'
    renderSidebar()

    expect(screen.getByText('Carga Masiva de Generadores')).toBeInTheDocument()
  })
})

describe('AppSidebar -- grupo "Residuos"', () => {
  test('agrupa el wizard de declaración y los catálogos RESPEL, sin Servicios/Logística/Operaciones', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['wastes.read', 'waste_streams.read', 'hazard_characteristics.read'],
      organization_enabled_sidebar_modules: ['RESIDUOS'],
    }
    mockPathname = '/admin/wastes'
    renderSidebar()

    expect(screen.getByText('Residuos', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('Corrientes Y/A')).toBeInTheDocument()
    expect(screen.getByText('Características de Peligrosidad')).toBeInTheDocument()
    // "Solicitudes de Servicio" ahora vive en "Servicios", no en "Residuos".
    expect(screen.queryByText('Solicitudes de Servicio')).not.toBeInTheDocument()
  })
})

describe('AppSidebar -- grupo "Servicios"', () => {
  test('gatea "Solicitudes de Servicio" por module + permiso', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['service_requests.read'],
      organization_enabled_sidebar_modules: [],
    }
    renderSidebar()

    expect(screen.queryByText('Servicios')).not.toBeInTheDocument()

    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['service_requests.read'],
      organization_enabled_sidebar_modules: ['SERVICIOS'],
    }
    mockPathname = '/admin/service-requests'
    renderSidebar()

    expect(screen.getByText('Servicios')).toBeInTheDocument()
    expect(screen.getByText('Solicitudes de Servicio')).toBeInTheDocument()
  })
})

describe('AppSidebar -- grupo "Logística"', () => {
  test('agrupa Vehículos/Conductores/Programación/Manifiestos/Rutas', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['vehicles.read', 'transport_personnel.read', 'transport_schedules.read'],
      organization_enabled_sidebar_modules: ['LOGISTICA'],
    }
    mockPathname = '/admin/vehicles'
    renderSidebar()

    expect(screen.getByText('Logística')).toBeInTheDocument()
    expect(screen.getByText('Vehículos')).toBeInTheDocument()
    expect(screen.getByText('Conductores')).toBeInTheDocument()
    expect(screen.getByText('Programación de Recolección')).toBeInTheDocument()
    expect(screen.queryByText('Rutas de Transporte')).not.toBeInTheDocument()
  })
})

describe('AppSidebar -- grupo "Operaciones"', () => {
  test('agrupa Tratamientos de Sucursal/Evaluaciones/catálogo de Tratamientos', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['branch_treatments.read', 'treatments.read'],
      organization_enabled_sidebar_modules: ['OPERACIONES'],
    }
    mockPathname = '/admin/branch-treatments'
    renderSidebar()

    expect(screen.getByText('Operaciones')).toBeInTheDocument()
    expect(screen.getByText('Tratamientos de Sucursal')).toBeInTheDocument()
    expect(screen.getByText('Tratamientos')).toBeInTheDocument()
    expect(screen.queryByText('Evaluaciones de Tratamiento')).not.toBeInTheDocument()
  })
})

describe('AppSidebar -- grupo "Administración"', () => {
  test('"Workflows" se gatea por workflows.manage, distinto de users.read/roles.read/permissions.read', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['roles.read'],
      organization_enabled_sidebar_modules: ['ADMINISTRACION'],
    }
    mockPathname = '/admin/roles'
    renderSidebar()

    expect(screen.queryByText('Workflows')).not.toBeInTheDocument()

    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['workflows.manage'],
      organization_enabled_sidebar_modules: ['ADMINISTRACION'],
    }
    mockPathname = '/admin/workflows'
    renderSidebar()

    expect(screen.getByText('Workflows')).toBeInTheDocument()
  })

  test('muestra todos los ítems cuando el usuario tiene todos los permisos y el módulo está habilitado', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['users.read', 'roles.read', 'permissions.read', 'workflows.manage'],
      organization_enabled_sidebar_modules: ['ADMINISTRACION'],
    }
    mockPathname = '/admin/users'
    renderSidebar()

    expect(screen.getByText('Usuarios')).toBeInTheDocument()
    expect(screen.getByText('Roles')).toBeInTheDocument()
    expect(screen.getByText('Permisos')).toBeInTheDocument()
    expect(screen.getByText('Matriz de Permisos')).toBeInTheDocument()
    expect(screen.getByText('Solicitudes de Invitación')).toBeInTheDocument()
    expect(screen.getByText('Workflows')).toBeInTheDocument()
  })
})

// Corrección de bug reportado por el usuario tras la reorganización en 7
// grupos (2026-09-28): las secciones deben arrancar plegadas salvo la que
// contiene la página actual (ver nav-main.tsx, `findActiveItem`/`open`).
describe('AppSidebar -- plegado por defecto salvo la sección de la página activa', () => {
  test('en "/" (Inicio), ningún grupo de admin tiene la página activa -> todos plegados (solo se ve el encabezado)', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['users.read', 'wastes.read'],
      organization_enabled_sidebar_modules: ['ADMINISTRACION', 'RESIDUOS'],
    }
    mockPathname = '/'
    renderSidebar()

    expect(screen.getByText('Administración')).toBeInTheDocument()
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument()
    // Cuando el grupo está plegado solo el encabezado ("Residuos", texto
    // plano sin <span>) está en el DOM -- el ítem "Residuos" (envuelto en
    // <span>, ver nav-main.tsx) no existe todavía, viven en el mismo texto
    // pero se distinguen por el selector.
    expect(screen.getByText('Residuos')).toBeInTheDocument()
    expect(screen.queryByText('Residuos', { selector: 'span' })).not.toBeInTheDocument()
    expect(screen.queryByText('Corrientes Y/A')).not.toBeInTheDocument()
  })

  test('al estar en una página de "Residuos", solo ese grupo se despliega -- "Administración" sigue plegado', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['users.read', 'wastes.read'],
      organization_enabled_sidebar_modules: ['ADMINISTRACION', 'RESIDUOS'],
    }
    mockPathname = '/admin/wastes'
    renderSidebar()

    // Desplegado: ahora sí existe el ítem "Residuos" (<span>), distinto del
    // encabezado del grupo con el mismo texto.
    expect(screen.getByText('Residuos', { selector: 'span' })).toBeInTheDocument()
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument()
  })
})

// Comportamiento tipo "acordeón" pedido explícitamente (2026-09-30): al
// desplegar una sección, la que estuviera desplegada se pliega -- solo una
// puede estar abierta a la vez entre TODOS los grupos (antes cada `NavMain`
// manejaba su propio estado de forma independiente).
describe('AppSidebar -- acordeón: abrir una sección pliega la otra', () => {
  test('desplegar "Administración" pliega "Residuos", que estaba desplegada por ser la página activa', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['users.read', 'wastes.read'],
      organization_enabled_sidebar_modules: ['ADMINISTRACION', 'RESIDUOS'],
    }
    mockPathname = '/admin/wastes'
    renderSidebar()

    // "Residuos" arranca desplegada (página activa); "Administración" plegada.
    expect(screen.getByText('Residuos', { selector: 'span' })).toBeInTheDocument()
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument()

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Administración' }))
    })

    expect(screen.getByText('Usuarios')).toBeInTheDocument()
    expect(screen.queryByText('Residuos', { selector: 'span' })).not.toBeInTheDocument()
  })

  test('desplegar una segunda sección pliega la primera que se había abierto a mano', () => {
    mockUser = {
      username: 'ana',
      email: 'ana@example.com',
      permissions: ['users.read', 'wastes.read'],
      organization_enabled_sidebar_modules: ['ADMINISTRACION', 'RESIDUOS'],
    }
    mockPathname = '/'
    renderSidebar()

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Residuos' }))
    })
    expect(screen.getByText('Residuos', { selector: 'span' })).toBeInTheDocument()

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Administración' }))
    })

    expect(screen.getByText('Usuarios')).toBeInTheDocument()
    expect(screen.queryByText('Residuos', { selector: 'span' })).not.toBeInTheDocument()
  })
})
