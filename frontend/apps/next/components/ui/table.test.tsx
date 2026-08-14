import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table'

// Estilos compartidos por las ~60 tablas del admin (pedido del usuario,
// 2026-08-13: la tabla se veía "demasiado simple, solo blanco, negro y
// verde"). Se testea la CLASE y no el pixel porque el punto delicado aquí es
// de especificidad CSS, no de apariencia -- ver el comentario de `TableRow`.

function renderTable() {
  return render(
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Residuo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Aceite Lubricante Usado</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  )
}

describe('Table', () => {
  test('el encabezado es secundario (atenuado, pequeño, mayúsculas) para no competir con los datos en negrilla', () => {
    renderTable()
    const head = screen.getByRole('columnheader', { name: 'Residuo' })

    expect(head).toHaveClass('text-xs', 'uppercase')
    // Más grueso que los nombres de las celdas (`font-medium`): a 12px un
    // semibold se percibía más delgado que los nombres a 14px.
    expect(head).toHaveClass('font-bold')
    expect(head).not.toHaveClass('font-medium', 'font-semibold')
  })

  // El color del texto se DERIVA del tema (`text-foreground/80`), no es un
  // color propio: así en oscuro los títulos salen blancos y en claro casi
  // negros, sin poder quedar invertidos.
  test('el texto del encabezado hereda el color del tema en vez de fijar uno propio', () => {
    renderTable()
    expect(screen.getByRole('columnheader', { name: 'Residuo' })).toHaveClass('text-foreground/80')
  })

  // La banda es un ALPHA sobre la superficie, nunca un color sólido por tema:
  // así se mezcla con el fondo de cada tema y en oscuro no puede volverse
  // clara (que fue justo el fallo reportado con `--table-header` sólido).
  test('la franja del encabezado es un alpha azul sobre la superficie, con su contraparte oscura', () => {
    const { container } = renderTable()
    const thead = container.querySelector('thead')

    expect(thead).toHaveClass('bg-sky-500/10', 'dark:bg-sky-400/12')
    expect(thead?.className).not.toContain('bg-table-header')
  })

  // El encabezado es la referencia fija de la tabla: el hover NO debe pesar
  // más que él (se igualaron las opacidades a propósito, 10% claro / 12%
  // oscuro). Si alguien sube la del hover, este test lo detiene.
  test('el resaltado de la fila activa no pesa más que la franja del encabezado', () => {
    const { container } = renderTable()
    const header = container.querySelector('thead')!.className
    const row = screen.getAllByRole('row')[1]!.className

    const headerLight = Number(/bg-sky-500\/(\d+)/.exec(header)![1])
    const hoverLight = Number(/hover:bg-emerald-600\/(\d+)/.exec(row)![1])
    expect(hoverLight).toBeLessThanOrEqual(headerLight)

    const headerDark = Number(/dark:bg-sky-400\/(\d+)/.exec(header)![1])
    const hoverDark = Number(/dark:hover:bg-emerald-400\/(\d+)/.exec(row)![1])
    expect(hoverDark).toBeLessThanOrEqual(headerDark)
  })

  // El hover es VERDE y el zebra gris: se distinguen por matiz, no por tono.
  test('los estados interactivos son verdes, no azules ni el mismo gris del zebra', () => {
    renderTable()
    const row = screen.getAllByRole('row')[1]!.className

    expect(row).toContain('hover:bg-emerald-600/10')
    expect(row).not.toContain('hover:bg-sky')
    expect(row).not.toContain('hover:bg-muted')
  })

  // REGRESIÓN: en Tailwind v4 `:nth-child(even)` se emite DESPUÉS de
  // `:hover`/`:has()`/`[data-state]` y todas tienen la misma especificidad,
  // así que un `even:bg-*` a secas gana por orden de fuente y apaga esos tres
  // estados en las filas pares. Cada estado debe repetirse con `even:` para
  // ganar por especificidad (dos pseudo-clases). Si alguien "simplifica"
  // estas clases, este test falla.
  test('cada estado interactivo se repite con la variante even: para que el zebra no lo apague en las filas pares', () => {
    renderTable()
    const row = screen.getAllByRole('row')[1] as HTMLElement

    expect(row).toHaveClass('even:bg-muted/30')

    for (const [base, paired] of [
      ['hover:bg-emerald-600/10', 'even:hover:bg-emerald-600/10'],
      ['has-aria-expanded:bg-emerald-600/10', 'even:has-aria-expanded:bg-emerald-600/10'],
      ['data-[state=selected]:bg-emerald-600/10', 'even:data-[state=selected]:bg-emerald-600/10'],
      // La contraparte oscura necesita su propio par `even:`, por el mismo
      // motivo de especificidad.
      ['dark:hover:bg-emerald-400/12', 'dark:even:hover:bg-emerald-400/12'],
    ]) {
      expect(row).toHaveClass(base)
      expect(row).toHaveClass(paired)
    }
  })

  // El zebra (estructura) y los estados interactivos deben distinguirse por
  // MATIZ, no por tono: antes ambos eran `bg-muted` y en claro se separaban
  // apenas ΔL=0.006, así que el hover se confundía con la franja intercalada.
  test('el zebra usa gris y los estados interactivos azul, para no confundirse entre sí', () => {
    renderTable()
    const row = screen.getAllByRole('row')[1] as HTMLElement

    expect(row.className).toContain('even:bg-muted/30')
    expect(row.className).not.toContain('hover:bg-muted')
  })
})
