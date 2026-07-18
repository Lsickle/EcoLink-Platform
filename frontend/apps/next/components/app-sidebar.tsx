"use client"

import * as React from "react"
import Image from "next/image"
import { useTheme } from "next-themes"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { LayoutDashboardIcon, LayoutGridIcon, Settings2Icon, SearchIcon, UsersIcon, ShieldCheckIcon, KeyRoundIcon, MailPlusIcon, RecycleIcon, TruckIcon, GlobeIcon, MapIcon, MapPinIcon, LandPlotIcon, Building2Icon, NetworkIcon, AlertTriangleIcon, LayersIcon, DropletsIcon, PackageIcon, ShieldAlertIcon, BuildingIcon, WarehouseIcon, IdCardIcon, CarFrontIcon, FlaskConicalIcon, FlaskRoundIcon, ClipboardListIcon, ClipboardCheckIcon } from "lucide-react"
import { useAuth } from "app/provider/auth"

// Sin módulos de negocio todavía (Residuos, Solicitudes, Manifiestos, etc.)
// -- solo los destinos reales de la app hoy (Inicio + Administración RBAC,
// ya con pantallas construidas en app/admin/*). No inventar ítems.
const data = {
  navMain: [
    {
      title: "Inicio",
      url: "/",
      icon: <LayoutDashboardIcon />,
    },
  ],
  // Revisión de seguridad del lote admin/*: cada item lleva el permiso
  // `read` de su propio módulo -- se filtra en AppSidebar contra
  // user.permissions, así que si mañana alguien solo tiene uno de los tres
  // ve solo ese item (defensa en profundidad, el backend ya rechaza con 403
  // cada request igual).
  navAdmin: [
    {
      title: "Usuarios",
      url: "/admin/users",
      icon: <UsersIcon />,
      permission: "users.read",
    },
    // Plan "CRUD de Sedes (Branches) + Contactos" (2026-07-15) -- acceso
    // DUAL (platform staff gestiona TODAS las sedes de TODAS las
    // organizaciones; un admin de tenant solo las de la suya, ver
    // `BranchController`/`BranchPolicy`), por eso vive en "Administración"
    // (gateado por `branches.read`, mismo patrón que Usuarios/Roles/
    // Permisos) y NO en "Plataforma" (exclusivo de `is_platform_staff`, sin
    // permiso RBAC asociado -- ver `navPlatform` más abajo).
    {
      title: "Sucursales",
      url: "/admin/branches",
      icon: <WarehouseIcon />,
      permission: "branches.read",
    },
    // Módulo standalone "Contactos" (2026-07-16) -- distinto del panel de
    // contactos dentro de Organización/Sede (OrganizationContactsPanel.tsx,
    // sin ítem propio en el sidebar). Mismo criterio que "Sedes": acceso
    // DUAL (platform staff ve todos, un admin de tenant solo los suyos, ver
    // ContactController), por eso vive en "Administración" gateado por
    // `contacts.read` y NO en "Plataforma".
    {
      title: "Contactos",
      url: "/admin/contacts",
      icon: <IdCardIcon />,
      permission: "contacts.read",
    },
    // CRUD de Vehículos (RN-VEH-001 a RN-VEH-008, CU-051.1/.2/.3/.4,
    // 2026-07-16) -- mismo mecanismo de acceso DUAL EXACTO que "Sedes"/
    // "Contactos" (platform staff gestiona TODOS los vehículos de cualquier
    // organización; un admin de tenant solo los de la suya, ver
    // `VehicleController`/`VehiclePolicy`), por eso vive en "Administración"
    // gateado por `vehicles.read` y NO en "Plataforma". `CarFrontIcon` en vez
    // de `TruckIcon` (ya usado por "Códigos UN"/"Tipos de Vehículo") para no
    // repetir ícono dentro del mismo grupo de navegación.
    {
      title: "Vehículos",
      url: "/admin/vehicles",
      icon: <CarFrontIcon />,
      permission: "vehicles.read",
    },
    // Módulo Tratamiento (RN-063/D-R02) -- "Tratamientos de Sucursal"
    // (`branch_treatments`), acceso DUAL, mismo patrón EXACTO que Sedes/
    // Vehículos (ver `BranchTreatmentController`/`BranchTreatmentPolicy`).
    // Distinto del catálogo GLOBAL "Tratamientos" (navCatalogs, exclusivo de
    // platform staff para escritura) -- `FlaskRoundIcon` en vez de
    // `FlaskConicalIcon` (ya usado por el catálogo en navCatalogs) para
    // distinguirlos visualmente aunque estén en grupos distintos.
    {
      title: "Tratamientos de Sucursal",
      url: "/admin/branch-treatments",
      icon: <FlaskRoundIcon />,
      permission: "branch_treatments.read",
    },
    // "Evaluación del Gestor" (waste_treatment_approvals) -- listado GENERAL
    // desde la perspectiva del Gestor evaluador (o platform staff viendo
    // todas), mismo grupo "Administración" que Vehículos/Tratamientos de
    // Sucursal/Contactos (acceso dual, ver
    // `WasteTreatmentApprovalController`/`WasteTreatmentApprovalPolicy`).
    // Sin ítem "Crear" -- las solicitudes SIEMPRE se crean desde el detalle
    // de un Residuo (tab "Tratamientos" en `WasteDetailScreen.tsx`), nunca
    // desde este listado.
    {
      title: "Evaluaciones de Tratamiento",
      url: "/admin/treatment-approvals",
      icon: <ClipboardCheckIcon />,
      permission: "treatment_approvals.read",
    },
    // Mecanismo de invitación (CU-006.1 modificado, reemplaza el registro
    // público eliminado): mismo permiso `users.read` que "Usuarios" -- es el
    // mismo gate que usa InvitationRequestController::index() en el backend.
    {
      title: "Solicitudes de Invitación",
      url: "/admin/invitation-requests",
      icon: <MailPlusIcon />,
      permission: "users.read",
    },
    {
      title: "Roles",
      url: "/admin/roles",
      icon: <ShieldCheckIcon />,
      permission: "roles.read",
    },
    {
      title: "Permisos",
      url: "/admin/permissions",
      icon: <KeyRoundIcon />,
      permission: "permissions.read",
    },
    // Cierre de brecha del CRUD de Permisos vs. Figma: pantalla nueva
    // "Matriz de Permisos" (3 sub-vistas Por Rol/Por Módulo/Comparativa) --
    // mismo permiso `permissions.read` que "Permisos".
    {
      title: "Matriz de Permisos",
      url: "/admin/permissions/matrix",
      icon: <LayoutGridIcon />,
      permission: "permissions.read",
    },
  ],
  // Primer módulo real del dominio Residuos (plan aprobado, distinto de
  // RBAC/Administración): mismo mecanismo de filtrado por permiso que
  // navAdmin -- ver visibleResiduosItems abajo.
  navResiduos: [
    // Núcleo del Módulo Residuos -- declaración/clasificación (wizard de 5
    // pasos, `wastes`). Acceso DUAL, mismo mecanismo EXACTO que "Vehículos"/
    // "Tratamientos de Sucursal" (platform staff ve todos, un tenant admin
    // solo los suyos, ver `WasteController`/`WastePolicy`). Primer ítem del
    // grupo (antes de los catálogos Corrientes/UN que lo alimentan) --
    // `ClipboardListIcon` para distinguirlo de `RecycleIcon`/`TruckIcon` ya
    // usados por los catálogos hermanos de este mismo grupo.
    {
      title: "Residuos",
      url: "/admin/wastes",
      icon: <ClipboardListIcon />,
      permission: "wastes.read",
    },
    // "Residuos Preaprobados" (`wastes.waste_type_id=PREAPPROVED`, RN-191,
    // ver docblock completo de `PreapprovedWasteController`) -- gateado
    // SOLO por `preapproved_wastes.read`, MISMO criterio EXACTO que
    // "Tratamientos de Sucursal" arriba (Gestor-only en la práctica, pero
    // sin chequeo de `business_role` en el frontend -- se confía en que el
    // permiso solo se asigna a quien corresponde). `ClipboardCheckIcon` ya
    // usado por "Evaluaciones de Tratamiento" (navAdmin, grupo distinto) --
    // se reutiliza aquí a propósito: ambas pantallas giran sobre el mismo
    // concepto de "aprobación de tratamiento", solo que esta es
    // auto-aprobada.
    {
      title: "Residuos Preaprobados",
      url: "/admin/preapproved-wastes",
      icon: <ClipboardCheckIcon />,
      permission: "preapproved_wastes.read",
    },
    {
      title: "Corrientes Y/A",
      url: "/admin/waste-streams",
      icon: <RecycleIcon />,
      permission: "waste_streams.read",
    },
    {
      title: "Códigos UN",
      url: "/admin/un-codes",
      icon: <TruckIcon />,
      permission: "un_codes.read",
    },
  ],
  // Batch 1/3 de Catálogos Maestros (geografía en cascada D-P01 + Tipos de
  // Sede, backend cerrado -- ver CountryController/DepartmentController/
  // MunicipalityController/LocalityController/BranchTypeController): mismo
  // mecanismo de filtrado por permiso que navAdmin/navResiduos. `geography.read`
  // cubre los 4 catálogos geográficos (todos gateados por la misma Policy,
  // ver docblock de cada controller); `branch_types.read` es propio del
  // catálogo de Tipos de Sede (CRUD completo, a diferencia de los 4
  // geográficos que son de solo lectura). Deja espacio para que el grupo
  // crezca en próximos lotes (RESPEL, Embalaje) -- no agregar items sin
  // pantalla real construida.
  navCatalogs: [
    {
      title: "Países",
      url: "/admin/catalogs/countries",
      icon: <GlobeIcon />,
      permission: "geography.read",
    },
    {
      title: "Departamentos",
      url: "/admin/catalogs/departments",
      icon: <MapIcon />,
      permission: "geography.read",
    },
    {
      title: "Municipios",
      url: "/admin/catalogs/municipalities",
      icon: <MapPinIcon />,
      permission: "geography.read",
    },
    {
      title: "Localidades",
      url: "/admin/catalogs/localities",
      icon: <LandPlotIcon />,
      permission: "geography.read",
    },
    {
      title: "Tipos de Sucursal",
      url: "/admin/catalogs/branch-types",
      icon: <Building2Icon />,
      permission: "branch_types.read",
    },
    // Distinto de los 5 catálogos hermanos de arriba: NO es global, cada
    // área pertenece a una organización concreta (ver
    // OrganizationalAreaController). `organizational_areas.read`
    // (PermissionSeeder, gap ya cerrado en este lote).
    {
      title: "Áreas Organizacionales",
      url: "/admin/catalogs/organizational-areas",
      icon: <NetworkIcon />,
      permission: "organizational_areas.read",
    },
    // Batch 2/3 de Catálogos Maestros (RESPEL, backend cerrado -- 506 tests
    // Pest, ver HazardCharacteristicController/WasteCategoryController/
    // PhysicalStateController): mismo mecanismo de filtrado por permiso que
    // el resto del grupo. Los 3 son catálogos globales con CRUD completo,
    // mismo criterio que "Tipos de Sede" -- cada uno con su propio permiso
    // `.read` (nunca comparten uno solo entre sí, a diferencia de los 4
    // catálogos geográficos que sí comparten `geography.read`).
    {
      title: "Características de Peligrosidad",
      url: "/admin/catalogs/hazard-characteristics",
      icon: <AlertTriangleIcon />,
      permission: "hazard_characteristics.read",
    },
    {
      title: "Categoría de Residuo",
      url: "/admin/catalogs/waste-categories",
      icon: <LayersIcon />,
      permission: "waste_categories.read",
    },
    {
      title: "Estado Físico",
      url: "/admin/catalogs/physical-states",
      icon: <DropletsIcon />,
      permission: "physical_states.read",
    },
    // Batch 3/3 (último) de Catálogos Maestros (backend cerrado -- 581
    // tests Pest, ver PackagingTypeController/PackagingConditionController/
    // VehicleTypeController): mismo mecanismo de filtrado por permiso que
    // el resto del grupo. "Tipos de Embalaje" tiene datos REALES
    // confirmados; "Estados del Embalaje" y "Tipos de Vehículo" son
    // PROVISIONALES (ver ProvisionalDataNotice en sus pantallas) -- ese
    // aviso vive en la pantalla, no en el ítem del menú.
    {
      title: "Tipos de Embalaje",
      url: "/admin/catalogs/packaging-types",
      icon: <PackageIcon />,
      permission: "packaging_types.read",
    },
    {
      title: "Estados del Embalaje",
      url: "/admin/catalogs/packaging-conditions",
      icon: <ShieldAlertIcon />,
      permission: "packaging_conditions.read",
    },
    {
      title: "Tipos de Vehículo",
      url: "/admin/catalogs/vehicle-types",
      icon: <TruckIcon />,
      permission: "vehicle_types.read",
    },
    // Módulo Tratamiento (RN-063/D-R02, backend cerrado -- 762 tests, ver
    // TreatmentController): catálogo GLOBAL de tipos de tratamiento
    // ambiental. Gestionado EXCLUSIVAMENTE por platform staff (la lectura sí
    // está disponible para cualquier actor con `treatments.read` -- los
    // Gestores lo necesitan para configurar sus `branch_treatments`, ver
    // "Tratamientos de Sucursal" en navAdmin). El ítem del sidebar se
    // muestra igual para cualquiera con el permiso -- la pantalla misma
    // oculta los controles de escritura si `!user.is_platform_staff`.
    {
      title: "Tratamientos",
      url: "/admin/catalogs/treatments",
      icon: <FlaskConicalIcon />,
      permission: "treatments.read",
    },
  ],
  // Plan "CRUD de Organizaciones vs. Figma (solo Organizaciones)" -- pantalla
  // EXCLUSIVA de platform staff (staff de EcoLink gestionando TODAS las
  // organizaciones cliente, ver OrganizationController::`isPlatformStaff()`
  // -- NO una Policy de modelo ni un permiso RBAC). A diferencia de
  // navAdmin/navResiduos/navCatalogs de arriba, este grupo NO se filtra
  // contra `user.permissions` (no tiene ningún `permission` asociado) --
  // se filtra en `AppSidebar` directamente contra `user.is_platform_staff`
  // (ver `visiblePlatformItems` abajo), mismo campo ya expuesto por
  // `AuthController::me()`/`useRequireAuth(undefined, {
  // requirePlatformStaff: true })` en OrganizationsListScreen.tsx.
  navPlatform: [
    {
      title: "Organizaciones",
      url: "/admin/organizations",
      icon: <BuildingIcon />,
    },
  ],
  // "Buscar" y "Configuración" son placeholders inertes (url: "#") a
  // propósito -- esas pantallas todavía no existen.
  navSecondary: [
    {
      title: "Configuración",
      url: "#",
      icon: <Settings2Icon />,
    },
    {
      title: "Buscar",
      url: "#",
      icon: <SearchIcon />,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  // Mismo patrón anti-parpadeo de hidratación que features/auth/AuthLayout.tsx
  // -- el tema real solo se conoce en cliente.
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const iconSrc = !mounted ? null : resolvedTheme === "dark" ? "/icon-mark-dark.png" : "/icon-mark-light.png"

  // Mientras la sesión carga, user es null -- se trata igual que "sin
  // permisos" a propósito, para no mostrar el grupo y ocultarlo un
  // instante después (parpadeo).
  const { user } = useAuth()
  const userPermissions = user?.permissions ?? []
  const visibleAdminItems = data.navAdmin.filter((item) => userPermissions.includes(item.permission))
  const visibleResiduosItems = data.navResiduos.filter((item) => userPermissions.includes(item.permission))
  const visibleCatalogsItems = data.navCatalogs.filter((item) => userPermissions.includes(item.permission))
  // Criterio de visibilidad DISTINTO al resto de grupos -- `is_platform_staff`,
  // no `user.permissions` (ver comentario en `data.navPlatform` arriba).
  const visiblePlatformItems = user?.is_platform_staff ? data.navPlatform : []

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<a href="/" />}
            >
              {iconSrc && <Image src={iconSrc} alt="" width={28} height={18} priority unoptimized />}
              <span className="text-base font-semibold">EcoLink</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        {visibleResiduosItems.length > 0 && <NavMain items={visibleResiduosItems} label="Residuos" />}
        {visibleCatalogsItems.length > 0 && <NavMain items={visibleCatalogsItems} label="Catálogos" />}
        {visibleAdminItems.length > 0 && <NavMain items={visibleAdminItems} label="Administración" />}
        {visiblePlatformItems.length > 0 && <NavMain items={visiblePlatformItems} label="Plataforma" />}
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
