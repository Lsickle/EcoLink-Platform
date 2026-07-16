import type { ReactNode } from 'react'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { CATALOG_COLOR_CLASSES, type CatalogColorVariant } from './colors'

interface CatalogSidebarStatProps {
  label: string
  value: string | number
  colorVariant?: CatalogColorVariant
  icon?: ReactNode
  withDivider?: boolean
  className?: string
}

// Fila de métrica típica dentro de una CatalogSidebarSection de tipo
// "lista de métricas" (ej. "Uso Operativo" / "Distribución por X" del
// sidebar): punto o ícono de color a la izquierda junto a la etiqueta,
// valor a la derecha, separador inferior opcional (el último elemento de
// una lista suele pasar withDivider={false}).
export function CatalogSidebarStat({
  label,
  value,
  colorVariant,
  icon,
  withDivider = true,
  className,
}: CatalogSidebarStatProps) {
  const colors = colorVariant ? CATALOG_COLOR_CLASSES[colorVariant] : null

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon ? (
            <span className={cn('shrink-0', colors?.icon)} aria-hidden="true">
              {icon}
            </span>
          ) : (
            colors && (
              <span
                data-testid="catalog-sidebar-stat-dot"
                className={cn('size-2 shrink-0 rounded-full', colors.solid)}
                aria-hidden="true"
              />
            )
          )}
          {label}
        </span>
        <span className="text-sm font-medium text-foreground">{value}</span>
      </div>
      {withDivider && <Separator data-testid="catalog-sidebar-stat-divider" />}
    </div>
  )
}
