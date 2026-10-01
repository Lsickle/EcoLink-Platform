"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"

import { NavMain, findActiveItem } from "@/components/nav-main"
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
import { Settings2Icon, SearchIcon } from "lucide-react"
import { useAuth } from "app/provider/auth"
import {
  navHomeItems,
  navPlatformItems,
  sidebarModuleGroups,
  type SidebarModuleCode,
} from "@/config/sidebar-nav"

// "Buscar" y "Configuración" son placeholders inertes (url: "#") a
// propósito -- esas pantallas todavía no existen. Fuera del mecanismo de
// grupos por módulo, sin cambios respecto a la versión anterior.
const navSecondary = [
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
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  // Mismo patrón anti-parpadeo de hidratación que features/auth/AuthLayout.tsx
  // -- el tema real solo se conoce en cliente.
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const iconSrc = !mounted ? null : resolvedTheme === "dark" ? "/icon-mark-dark.png" : "/icon-mark-light.png"

  // Mientras la sesión carga, user es null -- se trata igual que "sin
  // permisos"/"sin módulos habilitados" a propósito, para no mostrar ningún
  // grupo y ocultarlo un instante después (parpadeo).
  const { user } = useAuth()
  const userPermissions = user?.permissions ?? []
  // `permission` acepta un solo código o una lista (OR) -- necesario para
  // ítems accesibles por más de un permiso distinto (ej. "Carga Masiva de
  // Generadores", que un Subgestor ve con `generator_subgestor_relationships.create`
  // y un Gestor con `generator_gestor_relationships.create`).
  const hasRequiredPermission = (permission?: string | string[]) => {
    if (!permission) return true
    return Array.isArray(permission)
      ? permission.some((code) => userPermissions.includes(code))
      : userPermissions.includes(permission)
  }

  // Filtrado de DOS capas (reorganización del sidebar en 7 grupos temáticos,
  // 2026-09-28): (a) la organización del usuario debe tener el módulo
  // habilitado (`organization_enabled_sidebar_modules`, dato nuevo del
  // backend en GET /api/user) Y (b) el usuario debe tener al menos uno de
  // los permisos de algún ítem del grupo (mecanismo de permiso YA existente,
  // sin cambios de lógica). `is_platform_staff` bypasa SOLO la capa (a) --
  // staff de plataforma administra cualquier organización, así que el
  // "módulo habilitado" de una organización ajena no debería esconderle
  // nada; la capa (b) de permisos sigue aplicando igual.
  const enabledModules = new Set(user?.organization_enabled_sidebar_modules ?? [])
  const isModuleEnabledForUser = (code: SidebarModuleCode) => Boolean(user?.is_platform_staff) || enabledModules.has(code)

  const visibleGroups = sidebarModuleGroups
    .map((group) => ({
      ...group,
      items: isModuleEnabledForUser(group.code) ? group.items.filter((item) => hasRequiredPermission(item.permission)) : [],
    }))
    .filter((group) => group.items.length > 0)

  // Criterio de visibilidad DISTINTO al resto de grupos -- `is_platform_staff`,
  // no `user.permissions` ni el mecanismo de módulos (ver `navPlatformItems`
  // en config/sidebar-nav.tsx).
  const visiblePlatformItems = user?.is_platform_staff ? navPlatformItems : []

  // Comportamiento tipo "acordeón" (pedido explícito, 2026-09-30): al abrir
  // una sección, la que estuviera abierta se cierra -- por eso "cuál está
  // abierta" es UN solo valor compartido entre todos los grupos, no un
  // estado independiente por grupo (que es como vivía antes, dentro de cada
  // `NavMain`). Incluye "Plataforma" (clave sintética, no tiene `code` de
  // módulo); "Inicio" queda fuera, no tiene label ni mecanismo de plegado.
  const pathname = usePathname()
  const accordionSections = [
    ...visibleGroups.map((group) => ({ key: group.code as string, items: group.items })),
    ...(visiblePlatformItems.length > 0 ? [{ key: "PLATAFORMA", items: visiblePlatformItems }] : []),
  ]
  const activeSectionKey = accordionSections.find((section) => findActiveItem(section.items, pathname))?.key ?? null

  // Misma sección auto-desplegada al navegar a ella (ver nav-main.tsx),
  // ahora a nivel global: ajuste de estado durante el render, no en un
  // efecto.
  const [openSection, setOpenSection] = React.useState<string | null>(activeSectionKey)
  const [lastActiveSectionKey, setLastActiveSectionKey] = React.useState(activeSectionKey)
  if (activeSectionKey !== lastActiveSectionKey) {
    setLastActiveSectionKey(activeSectionKey)
    if (activeSectionKey) setOpenSection(activeSectionKey)
  }

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href="/" />}
            >
              {iconSrc && <Image src={iconSrc} alt="" width={28} height={18} priority unoptimized />}
              <span className="text-base font-semibold">EcoLink</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navHomeItems} />
        {visibleGroups.map((group) => (
          <NavMain
            key={group.code}
            items={group.items}
            label={group.label}
            colorVar={group.colorVar}
            isOpen={openSection === group.code}
            onOpenChange={(open) => setOpenSection(open ? group.code : null)}
          />
        ))}
        {visiblePlatformItems.length > 0 && (
          <NavMain
            items={visiblePlatformItems}
            label="Plataforma"
            isOpen={openSection === "PLATAFORMA"}
            onOpenChange={(open) => setOpenSection(open ? "PLATAFORMA" : null)}
          />
        )}
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
