// Paleta semántica compartida por el sistema visual de "Catálogos Maestros"
// (Figma CountriesPage / HazardCharacteristicsPage, fileKey
// pX6vqXxnJ66YSIYpE7v9pV): cada tarjeta KPI, cabecera de página y sección
// de sidebar usa una barra de acento a la izquierda con intención semántica
// (ej. "Total"=azul/neutral, "Activos"=verde, "Inactivos"=rojo,
// métricas específicas=naranja/púrpura), no un solo color repetido.
//
// `default` reutiliza el color primario del tema Emerald/Nova ya aplicado
// (--primary, verde #009869) vía las utilidades `*-primary` generadas por
// Tailwind a partir de `@theme inline` en globals.css -- no son clases de
// paleta literal, así que no dependen del escaneo de contenido.
export type CatalogColorVariant = 'default' | 'blue' | 'green' | 'red' | 'orange' | 'purple'

interface CatalogColorClasses {
  /** Barra de acento vertical (border-l-4) para tarjetas/headers. */
  bar: string
  /** Relleno sólido (barra de sidebar, punto indicador). */
  solid: string
  /** Color de texto/ícono a juego, con variante dark. */
  icon: string
  /** Tinte de fondo sutil opcional. */
  tint: string
}

export const CATALOG_COLOR_CLASSES: Record<CatalogColorVariant, CatalogColorClasses> = {
  default: {
    bar: 'border-l-primary',
    solid: 'bg-primary',
    icon: 'text-primary',
    tint: 'bg-primary/5',
  },
  blue: {
    bar: 'border-l-blue-500',
    solid: 'bg-blue-500',
    icon: 'text-blue-600 dark:text-blue-400',
    tint: 'bg-blue-500/5',
  },
  green: {
    bar: 'border-l-emerald-500',
    solid: 'bg-emerald-500',
    icon: 'text-emerald-600 dark:text-emerald-400',
    tint: 'bg-emerald-500/5',
  },
  red: {
    bar: 'border-l-red-500',
    solid: 'bg-red-500',
    icon: 'text-red-600 dark:text-red-400',
    tint: 'bg-red-500/5',
  },
  orange: {
    bar: 'border-l-orange-500',
    solid: 'bg-orange-500',
    icon: 'text-orange-600 dark:text-orange-400',
    tint: 'bg-orange-500/5',
  },
  purple: {
    bar: 'border-l-purple-500',
    solid: 'bg-purple-500',
    icon: 'text-purple-600 dark:text-purple-400',
    tint: 'bg-purple-500/5',
  },
}
