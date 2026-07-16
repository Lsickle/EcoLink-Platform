import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { CATALOG_COLOR_CLASSES, type CatalogColorVariant } from './colors'

interface CatalogSidebarSectionProps {
  title: string
  icon?: ReactNode
  colorVariant?: CatalogColorVariant
  children: ReactNode
  className?: string
}

// Sección apilable del sidebar derecho angosto del patrón "Catálogos
// Maestros": cabecera con barra de color + ícono + título, cuerpo con
// contenido libre (texto con badges, pares etiqueta/valor con
// CatalogSidebarStat, o una lista de botones de acción). Varias instancias
// se apilan una debajo de otra -- el `gap-4` de separación lo controla el
// contenedor de la pantalla que las use, no este componente.
export function CatalogSidebarSection({
  title,
  icon,
  colorVariant = 'default',
  children,
  className,
}: CatalogSidebarSectionProps) {
  const colors = CATALOG_COLOR_CLASSES[colorVariant]

  return (
    <Card className={cn('gap-3', className)}>
      <CardHeader className="flex items-center gap-2">
        <span data-testid="catalog-sidebar-section-bar" className={cn('h-4 w-1 shrink-0 rounded-full', colors.solid)} aria-hidden="true" />
        {icon && (
          <span className={cn('shrink-0', colors.icon)} aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">{children}</CardContent>
    </Card>
  )
}
