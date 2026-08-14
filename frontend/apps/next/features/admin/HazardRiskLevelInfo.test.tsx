import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { HazardRiskLevelInfo, HazardRiskLevelLegend } from './HazardRiskLevelInfo'
import {
  HAZARD_RISK_LEVEL_CLASSES,
  HAZARD_RISK_LEVEL_LABELS,
  hazardRiskLevel,
} from 'app/features/admin/hazardRiskLevel'

// Ayuda del badge de nivel de riesgo (pedido del usuario, 2026-08-14): el
// badge decía "Alto"/"Medio" sin explicar de dónde salía el nivel ni qué
// autoridad tiene.

describe('HazardRiskLevelInfo', () => {
  test('el disparador es un botón con nombre accesible, no un ícono mudo', () => {
    render(<HazardRiskLevelInfo />)

    // Que sea <button> importa: así el tooltip abre también con foco de
    // teclado, no solo con hover.
    expect(screen.getByRole('button', { name: 'Cómo se calcula el nivel de riesgo' })).toBeInTheDocument()
  })
})

describe('HazardRiskLevelLegend', () => {
  test.each([
    [9, 'Crítico'],
    [7, 'Alto'],
    [5, 'Medio'],
    [3, 'Bajo'],
    [1, 'Mínimo'],
  ])('muestra el umbral ≥%i junto a su etiqueta "%s"', (threshold, label) => {
    render(<HazardRiskLevelLegend />)

    const row = screen.getByText(`≥${threshold}`).closest('tr') as HTMLElement
    expect(within(row).getByText(label)).toBeInTheDocument()
  })

  test('cada umbral se pinta con el MISMO color que el badge real de ese nivel', () => {
    render(<HazardRiskLevelLegend />)

    for (const threshold of [9, 7, 5, 3, 1]) {
      const chip = screen.getByText(`≥${threshold}`)
      // Se compara contra la fuente de verdad (`hazardRiskLevel`), no contra
      // colores escritos a mano: si alguien mueve un umbral, la leyenda debe
      // seguirlo o este test falla.
      expect(chip.className).toContain(HAZARD_RISK_LEVEL_CLASSES[hazardRiskLevel(threshold)])
    }
  })

  test('advierte que la escala es informativa y NO normativa', () => {
    render(<HazardRiskLevelLegend />)

    expect(screen.getByText(/informativa de la plataforma/i)).toBeInTheDocument()
    expect(screen.getByText(/no proviene de la regulación RESPEL/i)).toBeInTheDocument()
  })

  test('los 5 niveles tienen colores distintos entre sí', () => {
    const classes = Object.values(HAZARD_RISK_LEVEL_CLASSES)
    expect(new Set(classes).size).toBe(classes.length)

    // Y las 5 etiquetas también son distintas.
    const labels = Object.values(HAZARD_RISK_LEVEL_LABELS)
    expect(new Set(labels).size).toBe(labels.length)
  })
})

// REGRESIÓN (2026-08-14): los badges de Alto/Medio/Mínimo salían SIN color.
// Causa: Tailwind v4 detecta el contenido a escanear desde la ubicación de
// globals.css hacia arriba, y eso dejaba fuera a `packages/app` -- donde
// viven estas clases. Los badges de Crítico y Bajo se veían solo porque
// otros archivos de apps/next usan por casualidad `text-red-700`/
// `text-emerald-700`. No hay error de build cuando esto se rompe: la clase
// simplemente no se genera y el color desaparece en silencio, así que se
// vigila la directiva explícitamente.
describe('escaneo de Tailwind sobre packages/app', () => {
  test('globals.css declara packages/app como fuente', () => {
    const globals = readFileSync(join(__dirname, '../../app/globals.css'), 'utf-8')

    expect(globals).toContain('@source "../../../packages/app"')
  })
})
