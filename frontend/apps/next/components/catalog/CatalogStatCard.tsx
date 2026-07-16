import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { CATALOG_COLOR_CLASSES, type CatalogColorVariant } from './colors'

interface CatalogStatCardProps {
  value: string | number
  label: string
  sublabel?: string
  colorVariant?: CatalogColorVariant
  icon?: ReactNode
  className?: string
}

// Tarjeta KPI del patrón "Catálogos Maestros" (Figma CountriesPage /
// HazardCharacteristicsPage, fileKey pX6vqXxnJ66YSIYpE7v9pV): barra de
// acento a la izquierda, valor grande, etiqueta y sub-etiqueta pequeña.
// Componente de presentación pura -- no hace fetching ni conoce el
// catálogo concreto que la usa; cada pantalla de catálogo decide qué KPIs
// mostrar y con qué colorVariant.
export function CatalogStatCard({
  value,
  label,
  sublabel,
  colorVariant = 'default',
  icon,
  className,
}: CatalogStatCardProps) {
  const colors = CATALOG_COLOR_CLASSES[colorVariant]

  return (
    <Card data-testid="catalog-stat-card" className={cn('gap-0 border-l-4 py-0', colors.bar, className)}>
      <CardContent className="flex items-start justify-between gap-3 py-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-2xl leading-tight font-semibold tabular-nums text-foreground">{value}</span>
          <span className="text-sm font-medium text-foreground">{label}</span>
          {sublabel && <span className="text-xs text-muted-foreground">{sublabel}</span>}
        </div>
        {icon && (
          <span className={cn('shrink-0', colors.icon)} aria-hidden="true">
            {icon}
          </span>
        )}
      </CardContent>
    </Card>
  )
}
