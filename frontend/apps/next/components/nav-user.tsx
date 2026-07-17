"use client"

import { useRouter } from "next/navigation"
import { useAuth } from "app/provider/auth"
import type { AuthRole, AuthUser } from "app/features/auth/api"
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { EllipsisVerticalIcon, KeyRoundIcon, LogOutIcon } from "lucide-react"

// Iniciales para el AvatarFallback (no hay campo `avatar` real todavía --
// RN-181 / AuthUser en packages/app/features/auth/api.ts no lo expone).
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ""
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase()
}

// Rol principal = rol ACTIVO (pivot.is_active === true, asignación vigente
// en user_roles) con el priority_level MÁS BAJO (1=Dirección .. 5=Operación,
// ver priorityLevelOptions en packages/app/features/admin/schemas.ts -- más
// bajo = más alto en jerarquía). Empate: cualquiera de los empatados sirve
// (Array.prototype.reduce se queda con el primero que encuentre). Sin
// ningún rol activo, no hay rol principal que mostrar.
function getPrimaryRole(user: Pick<AuthUser, "roles">): AuthRole | null {
  const activeRoles = (user.roles ?? []).filter((role) => role.pivot?.is_active === true)
  if (activeRoles.length === 0) return null
  return activeRoles.reduce((primary, role) =>
    role.priority_level < primary.priority_level ? role : primary
  )
}

export function NavUser() {
  const { isMobile } = useSidebar()
  const { user, logout } = useAuth()
  const router = useRouter()

  if (!user) {
    return null
  }

  const displayName = user.person?.full_name ?? user.username
  const initials = getInitials(displayName)
  const primaryRole = getPrimaryRole(user)

  async function handleLogout() {
    await logout()
    router.push("/login")
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />
            }
          >
            <Avatar className="size-8 rounded-lg grayscale">
              <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{displayName}</span>
              <span className="truncate text-xs text-foreground/70">
                {user.email}
              </span>
              {primaryRole && (
                <span className="truncate text-xs text-muted-foreground">{primaryRole.name}</span>
              )}
            </div>
            <EllipsisVerticalIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-8">
                    <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                    {primaryRole && (
                      <span className="truncate text-xs text-muted-foreground">{primaryRole.name}</span>
                    )}
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/change-password")}>
              <KeyRoundIcon />
              Cambiar contraseña
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOutIcon />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
