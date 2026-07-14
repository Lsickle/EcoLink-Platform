'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useRequireAuth } from 'app/provider/auth'

// Placeholder honesto post-login (gap confirmado: antes mandaba a la demo
// de Solito en '/'). Sin contenido de negocio real todavía -- solo
// bienvenida + accesos a las acciones de cuenta que sí existen hoy
// (cambiar contraseña, cerrar sesión).
export function WelcomeScreen() {
  const router = useRouter()
  const { user, isLoading, logout } = useRequireAuth()

  if (isLoading || !user) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  const displayName = user.person?.first_name ?? user.username

  async function handleLogout() {
    await logout()
    router.push('/login')
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Bienvenido, {displayName}</CardTitle>
        <CardDescription>
          Este es un panel provisional -- el contenido real de EcoLink todavía no está construido.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button variant="outline" className="w-full" onClick={() => router.push('/change-password')}>
          Cambiar contraseña
        </Button>
        <Button variant="ghost" className="w-full" onClick={handleLogout}>
          Cerrar sesión
        </Button>
      </CardContent>
    </Card>
  )
}
