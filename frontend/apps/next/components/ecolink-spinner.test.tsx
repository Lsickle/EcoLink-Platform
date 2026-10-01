import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EcoLinkSpinner } from './ecolink-spinner'

// Component tests for the loading-state replacement adopted across the app
// (see components/ecolink-spinner.tsx) -- preserva el mismo contrato
// accesible (`role="status"` + texto "Cargando…") que usaban las ~106
// pantallas con el `<p role="status">Cargando…</p>` genérico.

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('EcoLinkSpinner', () => {
  it('expone role="status" y el texto accesible por defecto', () => {
    mockMatchMedia(false)
    render(<EcoLinkSpinner />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Cargando…')
  })

  it('acepta un label custom y lo preserva como texto accesible', () => {
    mockMatchMedia(false)
    render(<EcoLinkSpinner label="Cargando calendario…" />)

    expect(screen.getByRole('status')).toHaveTextContent('Cargando calendario…')
  })

  it('sortea la variante "enlace" cuando Math.random() < 0.5', () => {
    mockMatchMedia(false)
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const { container } = render(<EcoLinkSpinner />)

    expect(container.querySelector('.es-green')).toBeTruthy()
    expect(container.querySelector('.es-pulse-a')).toBeFalsy()
  })

  it('sortea la variante "pulso" cuando Math.random() >= 0.5', () => {
    mockMatchMedia(false)
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const { container } = render(<EcoLinkSpinner />)

    expect(container.querySelector('.es-pulse-a')).toBeTruthy()
    expect(container.querySelector('.es-green')).toBeFalsy()
  })

  it('genera ids de gradiente sin colisión con dos instancias montadas a la vez', () => {
    mockMatchMedia(false)
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const { container } = render(
      <div>
        <EcoLinkSpinner label="Primero" />
        <EcoLinkSpinner label="Segundo" />
      </div>
    )

    const greenGradientIds = Array.from(container.querySelectorAll('linearGradient')).map((el) => el.id)
    const blueGradientIds = Array.from(container.querySelectorAll('radialGradient')).map((el) => el.id)

    expect(greenGradientIds).toHaveLength(2)
    expect(new Set(greenGradientIds).size).toBe(2)
    expect(blueGradientIds).toHaveLength(2)
    expect(new Set(blueGradientIds).size).toBe(2)

    // Cada <path fill="url(#...)"> debe referenciar el gradiente de SU
    // propia instancia, no el de la otra.
    const fills = Array.from(container.querySelectorAll('path[fill^="url(#"]')).map((el) => el.getAttribute('fill'))
    fills.forEach((fill) => {
      const id = fill!.slice(5, -1)
      expect([...greenGradientIds, ...blueGradientIds]).toContain(id)
    })
  })

  it('con prefers-reduced-motion no aplica animación (variante estática de reposo)', () => {
    mockMatchMedia(true)
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const { container } = render(<EcoLinkSpinner />)

    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('data-reduced-motion')).toBe('true')
    // Ninguna clase de animación (enlace o pulso) debe quedar aplicada
    // cuando el usuario prefiere movimiento reducido.
    expect(container.querySelector('.es-green')).toBeFalsy()
    expect(container.querySelector('.es-pulse-a')).toBeFalsy()
  })
})
