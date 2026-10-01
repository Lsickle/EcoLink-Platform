// Reorganización del sidebar en 7 grupos temáticos desplegables (2026-09-28)
// -- reclasifica los ~60 ítems que antes vivían en arrays planos inline
// dentro de app-sidebar.tsx (navMain/navAdmin/navResiduos/navCatalogs/
// navPlatform) en 7 grupos por dominio de negocio, cada uno con su propio
// color distintivo (ver `colorVar`, consumido por NavMain/globals.css).
//
// IMPORTANTE: este archivo NO cambia ningún `permission` ni `url` respecto
// al array del que salió cada ítem -- son copias literales, solo se movió
// la agrupación. El filtrado por permiso (`hasRequiredPermission`) sigue
// viviendo en app-sidebar.tsx, sin cambios de lógica. La capa NUEVA de
// filtrado (¿la organización tiene este módulo habilitado?) también vive en
// app-sidebar.tsx, usando `SidebarModuleCode` como llave.
//
// "Inicio" y "Plataforma" quedan FUERA de este mecanismo de 2 capas (ver
// `navHomeItems`/`navPlatformItems` al final) -- comportamiento sin cambios.
import type * as React from "react"
import {
  AlertTriangleIcon,
  BuildingIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CarFrontIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  DropletsIcon,
  FileSignatureIcon,
  FlaskConicalIcon,
  FlaskRoundIcon,
  GlobeIcon,
  IdCardIcon,
  KeyRoundIcon,
  LandPlotIcon,
  LayersIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  MailPlusIcon,
  MapIcon,
  MapPinIcon,
  MapPinnedIcon,
  NetworkIcon,
  PackageCheckIcon,
  PackageIcon,
  PackageSearchIcon,
  RecycleIcon,
  SendIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  TruckIcon,
  UploadCloudIcon,
  UserCheckIcon,
  UserRoundIcon,
  UsersIcon,
  WarehouseIcon,
  WorkflowIcon,
  Building2Icon,
} from "lucide-react"

// Códigos EXACTOS acordados con el backend (contrato en paralelo, 2026-09-28)
// -- catálogo `sidebar_modules`, 7 filas. `AuthUser.organization_enabled_sidebar_modules`
// y `AdminSidebarModule.code` usan estos mismos strings, no inventar otros.
export type SidebarModuleCode =
  | "ORGANIZACION"
  | "RESIDUOS"
  | "SERVICIOS"
  | "LOGISTICA"
  | "OPERACIONES"
  | "CERTIFICADOS"
  | "ADMINISTRACION"

export type SidebarNavItem = {
  title: string
  url: string
  icon: React.ReactNode
  permission?: string | string[]
}

export type SidebarNavGroup = {
  code: SidebarModuleCode
  label: string
  colorVar: string
  items: SidebarNavItem[]
}

export const sidebarModuleGroups: SidebarNavGroup[] = [
  {
    code: "ORGANIZACION",
    label: "Organización",
    colorVar: "--sidebar-group-organizacion",
    items: [
      // Plan "CRUD de Sedes (Branches) + Contactos" -- acceso DUAL (platform
      // staff ve todas, un tenant admin solo las suyas).
      { title: "Sucursales", url: "/admin/branches", icon: <WarehouseIcon />, permission: "branches.read" },
      { title: "Contactos", url: "/admin/contacts", icon: <IdCardIcon />, permission: "contacts.read" },
      {
        title: "Áreas Organizacionales",
        url: "/admin/catalogs/organizational-areas",
        icon: <NetworkIcon />,
        permission: "organizational_areas.read",
      },
      {
        title: "Tipos de Sucursal",
        url: "/admin/catalogs/branch-types",
        icon: <Building2Icon />,
        permission: "branch_types.read",
      },
      // Cadena Generador -> Subgestor -> Gestor (confirmado 2026-08-09).
      {
        title: "Generadores por Subgestor",
        url: "/admin/generator-subgestor-relationships",
        icon: <NetworkIcon />,
        permission: "generator_subgestor_relationships.read",
      },
      // Vínculo comercial DIRECTO Generador -> Gestor (confirmado 2026-08-11).
      {
        title: "Generadores por Gestor",
        url: "/admin/generator-gestor-relationships",
        icon: <NetworkIcon />,
        permission: "generator_gestor_relationships.read",
      },
      // Vínculo Subgestor -> Gestor (2026-08-15).
      {
        title: "Gestores Vinculados",
        url: "/admin/subgestor-gestor-relationships",
        icon: <NetworkIcon />,
        permission: "subgestor_gestor_relationships.read",
      },
      // Autoservicio de Subgestor/Gestor (confirmado 2026-08-11) -- visible
      // con CUALQUIERA de los dos permisos `.create` (OR).
      {
        title: "Carga Masiva de Generadores",
        url: "/admin/generators/bulk-import",
        icon: <UploadCloudIcon />,
        permission: ["generator_subgestor_relationships.create", "generator_gestor_relationships.create"],
      },
      // Batch 1/3 de Catálogos Maestros (geografía en cascada, D-P01).
      { title: "Países", url: "/admin/catalogs/countries", icon: <GlobeIcon />, permission: "geography.read" },
      { title: "Departamentos", url: "/admin/catalogs/departments", icon: <MapIcon />, permission: "geography.read" },
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
    ],
  },
  {
    code: "RESIDUOS",
    label: "Residuos",
    colorVar: "--sidebar-group-residuos",
    items: [
      // Núcleo del Módulo Residuos -- declaración/clasificación (wizard de 5
      // pasos, `wastes`). Acceso DUAL.
      { title: "Residuos", url: "/admin/wastes", icon: <ClipboardListIcon />, permission: "wastes.read" },
      {
        title: "Carga Masiva de Residuos",
        url: "/admin/wastes/bulk-import",
        icon: <UploadCloudIcon />,
        permission: "wastes.create",
      },
      // "Residuos Preaprobados" (RN-191).
      {
        title: "Residuos Preaprobados",
        url: "/admin/preapproved-wastes",
        icon: <ClipboardCheckIcon />,
        permission: "preapproved_wastes.read",
      },
      { title: "Corrientes Y/A", url: "/admin/waste-streams", icon: <RecycleIcon />, permission: "waste_streams.read" },
      // Batch 2/3 de Catálogos Maestros (RESPEL).
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
      // Batch 3/3 (último) de Catálogos Maestros.
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
        title: "Características de Peligrosidad",
        url: "/admin/catalogs/hazard-characteristics",
        icon: <AlertTriangleIcon />,
        permission: "hazard_characteristics.read",
      },
    ],
  },
  {
    code: "SERVICIOS",
    label: "Servicios",
    colorVar: "--sidebar-group-servicios",
    items: [
      // Solicitudes de Servicio (CU-014, Fase 1b, D-S01/D-S25) -- acceso NO
      // simétrico, ver ServiceRequestPolicy.
      {
        title: "Solicitudes de Servicio",
        url: "/admin/service-requests",
        icon: <SendIcon />,
        permission: "service_requests.read",
      },
    ],
  },
  {
    code: "LOGISTICA",
    label: "Logística",
    colorVar: "--sidebar-group-logistica",
    items: [
      // CRUD de Vehículos (RN-VEH-001 a RN-VEH-008, CU-051.1/.2/.3/.4).
      { title: "Vehículos", url: "/admin/vehicles", icon: <CarFrontIcon />, permission: "vehicles.read" },
      {
        title: "Conductores",
        url: "/admin/transport-personnel",
        icon: <UserRoundIcon />,
        permission: "transport_personnel.read",
      },
      // Módulo Programación Logística, Fase 2a (D-PRG-01 a D-PRG-14).
      {
        title: "Programación de Recolección",
        url: "/admin/transport-schedules",
        icon: <TruckIcon />,
        permission: "transport_schedules.read",
      },
      // "Dispatch board" (CU-059).
      {
        title: "Rutas de Transporte",
        url: "/admin/transport-schedules/dispatch-board",
        icon: <MapIcon />,
        permission: "transport_routes.read",
      },
      // Calendario de programación (shell de UI, 2026-09-28) -- mismo
      // permiso que exige TransportScheduleCalendarScreen (`useRequireAuth`).
      {
        title: "Calendario de Programación",
        url: "/admin/transport-schedules/calendar",
        icon: <CalendarDaysIcon />,
        permission: "transport_schedules.create",
      },
      // "Programación por Localidad" (mapa de Bogotá, 2026-09-30) -- vista
      // de solo lectura, gateada por `transport_schedules.read` (mismo
      // permiso que el listado, distinto de `.create` que exige el
      // Calendario porque ese sí programa).
      {
        title: "Programación por Localidad",
        url: "/admin/transport-schedules/locality-map",
        icon: <MapPinnedIcon />,
        permission: "transport_schedules.read",
      },
      // Módulo Manifiesto de Cargue, Fase 3.
      {
        title: "Manifiestos de Cargue",
        url: "/admin/manifest-loads",
        icon: <FileSignatureIcon />,
        permission: "manifest_loads.read",
      },
      // Programación Logística, Fase 4 "Cita de Recepción en Planta" (D-PRG-02).
      {
        title: "Solicitudes de Descargue",
        url: "/admin/unload-requests",
        icon: <PackageSearchIcon />,
        permission: "unload_requests.read",
      },
      // "Agenda de Recepciones en Planta" (Figma node 991:14128).
      {
        title: "Agenda de Recepciones",
        url: "/admin/unload-requests/agenda",
        icon: <CalendarClockIcon />,
        permission: "plant_reception_schedules.read",
      },
      // Módulo Manifiesto de Descargue, Fase 5 (última fase del plan).
      {
        title: "Manifiestos de Descargue",
        url: "/admin/manifest-unloads",
        icon: <PackageCheckIcon />,
        permission: "manifest_unloads.read",
      },
      // "Modalidad 3" -- gestión de `gestor_carrier_authorizations`.
      {
        title: "Autorizaciones de Transportador",
        url: "/admin/gestor-carrier-authorizations",
        icon: <UserCheckIcon />,
        permission: "gestor_carrier_authorizations.read",
      },
      {
        title: "Tipos de Vehículo",
        url: "/admin/catalogs/vehicle-types",
        icon: <TruckIcon />,
        permission: "vehicle_types.read",
      },
      { title: "Códigos UN", url: "/admin/un-codes", icon: <TruckIcon />, permission: "un_codes.read" },
    ],
  },
  {
    code: "OPERACIONES",
    label: "Operaciones",
    colorVar: "--sidebar-group-operaciones",
    items: [
      // Módulo Tratamiento (RN-063/D-R02) -- "Tratamientos de Sucursal",
      // acceso DUAL.
      {
        title: "Tratamientos de Sucursal",
        url: "/admin/branch-treatments",
        icon: <FlaskRoundIcon />,
        permission: "branch_treatments.read",
      },
      // "Evaluación del Gestor" (waste_treatment_approvals).
      {
        title: "Evaluaciones de Tratamiento",
        url: "/admin/treatment-approvals",
        icon: <ClipboardCheckIcon />,
        permission: "treatment_approvals.read",
      },
      // Catálogo GLOBAL de tipos de tratamiento ambiental (RN-063/D-R02).
      {
        title: "Tratamientos",
        url: "/admin/catalogs/treatments",
        icon: <FlaskConicalIcon />,
        permission: "treatments.read",
      },
    ],
  },
  {
    code: "CERTIFICADOS",
    label: "Certificados",
    colorVar: "--sidebar-group-certificados",
    // Sin ítems todavía -- sin pantallas construidas para este dominio. No
    // inventar ítems (ver prompt del lote "Reorganización del sidebar en 7
    // grupos"). El grupo queda oculto siempre (visibleGroups lo filtra por
    // tener 0 ítems), pero se declara aquí para que el catálogo de 7 módulos
    // del backend tenga su contraparte completa en el frontend.
    items: [],
  },
  {
    code: "ADMINISTRACION",
    label: "Administración",
    colorVar: "--sidebar-group-administracion",
    items: [
      { title: "Usuarios", url: "/admin/users", icon: <UsersIcon />, permission: "users.read" },
      { title: "Roles", url: "/admin/roles", icon: <ShieldCheckIcon />, permission: "roles.read" },
      { title: "Permisos", url: "/admin/permissions", icon: <KeyRoundIcon />, permission: "permissions.read" },
      {
        title: "Matriz de Permisos",
        url: "/admin/permissions/matrix",
        icon: <LayoutGridIcon />,
        permission: "permissions.read",
      },
      // Mecanismo de invitación (CU-006.1 modificado) -- mismo permiso que
      // "Usuarios".
      {
        title: "Solicitudes de Invitación",
        url: "/admin/invitation-requests",
        icon: <MailPlusIcon />,
        permission: "users.read",
      },
      // CU-021 "Configurar Workflow" (D-WF-01).
      { title: "Workflows", url: "/admin/workflows", icon: <WorkflowIcon />, permission: "workflows.manage" },
    ],
  },
]

// Fuera del mecanismo de 2 capas -- siempre visible, sin gate de permiso ni
// de módulo (comportamiento sin cambios respecto al `navMain` original).
export const navHomeItems: SidebarNavItem[] = [{ title: "Inicio", url: "/", icon: <LayoutDashboardIcon /> }]

// Fuera del mecanismo de 2 capas -- gate exclusivo por `is_platform_staff`
// (NO por permiso RBAC ni por módulo habilitado), comportamiento sin
// cambios respecto al `navPlatform` original.
export const navPlatformItems: SidebarNavItem[] = [
  { title: "Organizaciones", url: "/admin/organizations", icon: <BuildingIcon /> },
]
