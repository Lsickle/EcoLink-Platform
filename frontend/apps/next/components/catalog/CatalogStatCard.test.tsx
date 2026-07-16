import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { CatalogStatCard } from './CatalogStatCard'

// Sistema visual compartido "Catálogos Maestros" (Figma CountriesPage /
// HazardCharacteristicsPage, fileKey pX6vqXxnJ66YSIYpE7v9pV): tarjeta KPI
// con barra de acento izquierda, valor grande, etiqueta y sub-etiqueta.
describe('CatalogStatCard', () => {
  test('renders value, label and sublabel', () => {
    render(<CatalogStatCard value={42} label="Total" sublabel="Registrados en el sistema" />)

    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('Registrados en el sistema')).toBeInTheDocument()
  })

  test('does not render sublabel when omitted', () => {
    render(<CatalogStatCard value={1} label="Activos" />)

    expect(screen.queryByText('Registrados en el sistema')).not.toBeInTheDocument()
  })

  test('renders the icon slot when provided', () => {
    render(<CatalogStatCard value={1} label="Activos" icon={<span data-testid="stat-icon" />} />)

    expect(screen.getByTestId('stat-icon')).toBeInTheDocument()
  })

  test('defaults to the primary (emerald) color variant', () => {
    render(<CatalogStatCard value={1} label="Total" />)

    expect(screen.getByTestId('catalog-stat-card')).toHaveClass('border-l-primary')
  })

  test.each([
    ['blue', 'border-l-blue-500'],
    ['green', 'border-l-emerald-500'],
    ['red', 'border-l-red-500'],
    ['orange', 'border-l-orange-500'],
    ['purple', 'border-l-purple-500'],
  ] as const)('applies the accent bar class for colorVariant=%s', (variant, expectedClass) => {
    render(<CatalogStatCard value={1} label="Activos" colorVariant={variant} />)

    expect(screen.getByTestId('catalog-stat-card')).toHaveClass(expectedClass)
  })
})
