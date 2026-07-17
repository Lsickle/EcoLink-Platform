"use client"

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

export function NavMain({
  items,
  label,
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
}) {
  const menu = (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton tooltip={item.title} render={<a href={item.url} />}>
            {item.icon}
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
    <SidebarGroup>
      <Collapsible defaultOpen>
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
