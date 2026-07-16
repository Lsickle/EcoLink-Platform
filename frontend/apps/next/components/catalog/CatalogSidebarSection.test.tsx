import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { CatalogSidebarSection } from './CatalogSidebarSection'

// Sección apilable del sidebar derecho del patrón "Catálogos Maestros":
// cabecera con barra de color + ícono + título, cuerpo con contenido libre.
describe('CatalogSidebarSection', () => {
  test('renders title and children', () => {
    render(
      <CatalogSidebarSection title="Distribución por región">
        <p>Contenido de la sección</p>
      </CatalogSidebarSection>
    )

    expect(screen.getByText('Distribución por región')).toBeInTheDocument()
    expect(screen.getByText('Contenido de la sección')).toBeInTheDocument()
  })

  test('renders the icon slot when provided', () => {
    render(
      <CatalogSidebarSection title="Uso operativo" icon={<span data-testid="section-icon" />}>
        <p>Contenido</p>
      </CatalogSidebarSection>
    )

    expect(screen.getByTestId('section-icon')).toBeInTheDocument()
  })

  test('defaults to the primary (emerald) color variant', () => {
    render(
      <CatalogSidebarSection title="Uso operativo">
        <p>Contenido</p>
      </CatalogSidebarSection>
    )

    expect(screen.getByTestId('catalog-sidebar-section-bar')).toHaveClass('bg-primary')
  })

  test.each([
    ['blue', 'bg-blue-500'],
    ['red', 'bg-red-500'],
    ['purple', 'bg-purple-500'],
  ] as const)('applies the accent bar class for colorVariant=%s', (variant, expectedClass) => {
    render(
      <CatalogSidebarSection title="Uso operativo" colorVariant={variant}>
        <p>Contenido</p>
      </CatalogSidebarSection>
    )

    expect(screen.getByTestId('catalog-sidebar-section-bar')).toHaveClass(expectedClass)
  })
})
