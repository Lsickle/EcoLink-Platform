import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { CatalogSidebarStat } from './CatalogSidebarStat'

// Fila de métrica dentro de una CatalogSidebarSection: punto/ícono +
// etiqueta a la izquierda, valor a la derecha, separador inferior opcional.
describe('CatalogSidebarStat', () => {
  test('renders label and value', () => {
    render(<CatalogSidebarStat label="Genera residuos" value="128" />)

    expect(screen.getByText('Genera residuos')).toBeInTheDocument()
    expect(screen.getByText('128')).toBeInTheDocument()
  })

  test('renders a bottom divider by default', () => {
    render(<CatalogSidebarStat label="Genera residuos" value="128" />)

    expect(screen.getByTestId('catalog-sidebar-stat-divider')).toBeInTheDocument()
  })

  test('omits the divider when withDivider is false', () => {
    render(<CatalogSidebarStat label="Genera residuos" value="128" withDivider={false} />)

    expect(screen.queryByTestId('catalog-sidebar-stat-divider')).not.toBeInTheDocument()
  })

  test('renders a color dot indicator when colorVariant is given without an icon', () => {
    render(<CatalogSidebarStat label="Genera residuos" value="128" colorVariant="green" />)

    expect(screen.getByTestId('catalog-sidebar-stat-dot')).toHaveClass('bg-emerald-500')
  })

  test('renders the icon slot instead of the dot when provided', () => {
    render(
      <CatalogSidebarStat
        label="Genera residuos"
        value="128"
        colorVariant="green"
        icon={<span data-testid="stat-row-icon" />}
      />
    )

    expect(screen.getByTestId('stat-row-icon')).toBeInTheDocument()
    expect(screen.queryByTestId('catalog-sidebar-stat-dot')).not.toBeInTheDocument()
  })
})
