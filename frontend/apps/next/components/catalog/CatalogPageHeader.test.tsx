import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { CatalogPageHeader } from './CatalogPageHeader'

// Header de página del patrón "Catálogos Maestros": barra de acento
// izquierda + título + descripción + slot de acciones a la derecha.
describe('CatalogPageHeader', () => {
  test('renders title and description', () => {
    render(<CatalogPageHeader title="Países" description="Catálogo de países disponibles" />)

    expect(screen.getByRole('heading', { name: 'Países' })).toBeInTheDocument()
    expect(screen.getByText('Catálogo de países disponibles')).toBeInTheDocument()
  })

  test('does not render description when omitted', () => {
    render(<CatalogPageHeader title="Países" />)

    expect(screen.queryByText('Catálogo de países disponibles')).not.toBeInTheDocument()
  })

  test('renders actions slot when provided', () => {
    render(
      <CatalogPageHeader
        title="Países"
        actions={<button type="button">+ Crear país</button>}
      />
    )

    expect(screen.getByRole('button', { name: '+ Crear país' })).toBeInTheDocument()
  })

  test('defaults to the primary (emerald) color variant', () => {
    render(<CatalogPageHeader title="Países" />)

    expect(screen.getByTestId('catalog-page-header')).toHaveClass('border-l-primary')
  })

  test('applies the accent bar class for a given colorVariant', () => {
    render(<CatalogPageHeader title="Países" colorVariant="blue" />)

    expect(screen.getByTestId('catalog-page-header')).toHaveClass('border-l-blue-500')
  })
})
