"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"

// Un ítem está "activo" si la ruta actual es exactamente su `url`, o un
// sub-recurso de ella (ej. "/admin/wastes/bulk-import" activa el ítem
// "/admin/wastes/bulk-import" mismo, no el de "/admin/wastes" -- por eso
// `findActiveItem` se queda con el `url` más largo que matchea, no el
// primero). "#" (placeholders inertes como "Buscar"/"Configuración") nunca
// se marca activo.
function isPathActive(pathname: string, url: string): boolean {
  if (url === "#") return false
  if (url === "/") return pathname === "/"
  return pathname === url || pathname.startsWith(`${url}/`)
}

// Exportado -- app-sidebar.tsx también lo necesita para saber, a nivel
// global, qué sección de acordeón corresponde a la página actual (ver
// comentario sobre `isOpen`/`onOpenChange` más abajo).
export function findActiveItem<T extends { url: string }>(items: T[], pathname: string): T | undefined {
  return items
    .filter((item) => isPathActive(pathname, item.url))
    .sort((a, b) => b.url.length - a.url.length)[0]
}

// Color por grupo (reorganización del sidebar en 7 grupos temáticos,
// 2026-09-28) -- todos los grupos se pintan como gradiente (claro -> oscuro
// del mismo hue), no solo Administración. `colorVar` es el prefijo base (ej.
// "--sidebar-group-residuos"); los tonos reales viven en `${colorVar}-from`
// y `${colorVar}-to` (ver globals.css).
function colorBarStyle(colorVar: string): React.CSSProperties {
  return {
    background: `linear-gradient(180deg, var(${colorVar}-from), var(${colorVar}-to))`,
  }
}

function tintIcon(icon: React.ReactNode, colorVar: string): React.ReactNode {
  if (!React.isValidElement(icon)) return icon
  return React.cloneElement(icon as React.ReactElement<{ style?: React.CSSProperties }>, {
    style: { color: `var(${colorVar}-to)` },
  })
}

export function NavMain({
  items,
  label,
  colorVar,
  isOpen,
  onOpenChange,
}: {
  items: {
    title: string
    url: string
    icon?: React.ReactNode
  }[]
  // Encabezado opcional de sección (p. ej. "Administración") -- sin label,
  // se comporta exactamente igual que antes (grupo "Inicio" sin encabezado,
  // sin mecanismo de colapsar/expandir).
  label?: string
  // Nombre de la variable CSS de color del grupo (ej.
  // "--sidebar-group-residuos", ver config/sidebar-nav.tsx) -- opcional:
  // grupos sin colorVar (Inicio, Plataforma) se renderizan exactamente
  // igual que antes, sin barra ni tinte de ícono.
  colorVar?: string
  // Estado de plegado/desplegado -- CONTROLADO por el padre (app-sidebar.tsx),
  // no local a este componente. Comportamiento tipo "acordeón" pedido
  // explícitamente: solo una sección puede estar desplegada a la vez, así
  // que "cuál está abierta" tiene que vivir en un solo lugar compartido por
  // todos los grupos, no en el estado interno de cada `NavMain`. Ambos
  // opcionales solo para el grupo "Inicio" (sin `label`), que no los usa.
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const pathname = usePathname()
  const activeItem = findActiveItem(items, pathname)

  const menu = (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton
            tooltip={item.title}
            isActive={item === activeItem}
            render={<Link href={item.url} />}
          >
            {colorVar ? tintIcon(item.icon, colorVar) : item.icon}
            <span>{item.title}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )

  if (!label) {
    return (
      <SidebarGroup>
        <SidebarGroupContent className="flex flex-col gap-2">{menu}</SidebarGroupContent>
      </SidebarGroup>
    )
  }

  return (
    <SidebarGroup className={colorVar ? "relative pl-3" : "relative"}>
      {colorVar && (
        <span
          data-slot="nav-main-color-bar"
          aria-hidden="true"
          className="absolute top-0 left-1 h-full w-1 rounded-full"
          style={colorBarStyle(colorVar)}
        />
      )}
      <Collapsible open={isOpen ?? false} onOpenChange={onOpenChange}>
        <SidebarGroupLabel
          render={
            <CollapsibleTrigger className="group/nav-main-trigger flex w-full items-center justify-between" />
          }
        >
          {label}
          <ChevronDownIcon className="size-4 shrink-0 text-sidebar-foreground/70 group-aria-expanded/nav-main-trigger:hidden" />
          <ChevronUpIcon className="hidden size-4 shrink-0 text-sidebar-foreground/70 group-aria-expanded/nav-main-trigger:inline" />
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent className="flex flex-col gap-2">{menu}</SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  )
}
