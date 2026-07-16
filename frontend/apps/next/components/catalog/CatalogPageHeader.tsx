import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { CATALOG_COLOR_CLASSES, type CatalogColorVariant } from './colors'

interface CatalogPageHeaderProps {
  title: string
  description?: string
  colorVariant?: CatalogColorVariant
  actions?: ReactNode
  className?: string
}

// Header de página del patrón "Catálogos Maestros": barra de acento
// izquierda + título + descripción + slot de acciones a la derecha.
// Reemplaza repetir este layout en cada una de las ~12 pantallas de
// catálogo (Figma CountriesPage / HazardCharacteristicsPage).
export function CatalogPageHeader({
  title,
  description,
  colorVariant = 'default',
  actions,
  className,
}: CatalogPageHeaderProps) {
  const colors = CATALOG_COLOR_CLASSES[colorVariant]

  return (
    <Card data-testid="catalog-page-header" className={cn('gap-0 border-l-4 py-0', colors.bar, className)}>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </CardContent>
    </Card>
  )
}
