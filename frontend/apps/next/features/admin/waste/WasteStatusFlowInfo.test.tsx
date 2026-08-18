import { render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { WasteStatusFlowInfo, WasteStatusFlowLegend } from './WasteStatusFlowInfo'

// Ayuda del flujo de estados (pedido del usuario, 2026-08-14): la columna
// "Estado" decía dónde está el residuo pero no qué viene después ni si ya
// sirve para una Solicitud de Servicio.

describe('WasteStatusFlowInfo', () => {
  test('el disparador es un botón con nombre accesible', () => {
    render(<WasteStatusFlowInfo />)

    expect(screen.getByRole('button', { name: 'Ver el flujo de estados del residuo' })).toBeInTheDocument()
  })
})

describe('WasteStatusFlowLegend', () => {
  test.each([
    ['Borrador'],
    ['Declarado'],
    ['En Revisión'],
    ['Clasificado'],
    ['Aprobado'],
    // `Suspendido` no está aquí: no es un paso del camino, solo aparece como
    // nota al pie -- tiene su propio test más abajo.
  ])('muestra el estado "%s" del flujo real del backend', (label) => {
    render(<WasteStatusFlowLegend />)

    expect(screen.getAllByText(label).length).toBeGreaterThan(0)
  })

  // El rechazo técnico devuelve el residuo a DEC -- no existe ninguna
  // transición hacia un estado "Rechazado" en el backend.
  test('NO dibuja "Rechazado": ninguna transición del backend lo produce', () => {
    render(<WasteStatusFlowLegend />)

    expect(screen.queryByText('Rechazado')).not.toBeInTheDocument()
  })

  // Vuelve a Declarado, no a Borrador: se rechaza ESA evaluación, no el
  // residuo, así que los demás Gestores vinculados lo siguen viendo.
  test('explica que rechazar devuelve el residuo a Declarado, con el motivo', () => {
    render(<WasteStatusFlowLegend />)

    expect(screen.getByText(/rechaza la evaluación/i)).toBeInTheDocument()
    expect(screen.getByText(/observación del motivo/i)).toBeInTheDocument()
  })

  // El punto que originó la ayuda. Antes `status` y "se puede solicitar" eran
  // ejes INDEPENDIENTES; ahora el estado es la única señal, y el aviso tuvo
  // que cambiar con la regla.
  test('advierte que solo un residuo Aprobado habilita una Solicitud de Servicio', () => {
    render(<WasteStatusFlowLegend />)

    expect(screen.getByText(/Solo un residuo Aprobado/i)).toBeInTheDocument()
    expect(screen.getByText(/Llegar a Clasificado no basta/i)).toBeInTheDocument()
  })

  test('aclara que suspender es exclusivo de EcoLink y conserva la trazabilidad', () => {
    render(<WasteStatusFlowLegend />)

    expect(screen.getByText(/solo EcoLink puede retirar de circulación/i)).toBeInTheDocument()
  })

  // Anotación pedida por el usuario (2026-08-18): que quede constancia visible
  // de por qué "Aprobar con Restricciones" ya no está, para que nadie lo busque
  // creyendo que falta.
  test('deja constancia de que Aprobar con Restricciones se retiró temporalmente', () => {
    render(<WasteStatusFlowLegend />)

    expect(screen.getByText(/Aprobar con Restricciones — retirado temporalmente/i)).toBeInTheDocument()
    expect(screen.getByText(/se valida con los stakeholders/i)).toBeInTheDocument()
  })

  test('los 5 estados del camino feliz van en el orden real del flujo', () => {
    const { container } = render(<WasteStatusFlowLegend />)
    const diagram = container.querySelector('div.flex.flex-wrap') as HTMLElement

    const order = ['Borrador', 'Declarado', 'En Revisión', 'Clasificado', 'Aprobado']
    const rendered = order.map((label) => within(diagram).getByText(label))

    for (let i = 1; i < rendered.length; i += 1) {
      // compareDocumentPosition: el anterior precede al siguiente en el DOM.
      expect(rendered[i - 1]!.compareDocumentPosition(rendered[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  // `SUS` no está en el diagrama lineal: no es un paso del camino, es una
  // salida lateral desde `APR`.
  test('Suspendido queda fuera del diagrama lineal, solo como nota', () => {
    const { container } = render(<WasteStatusFlowLegend />)
    const diagram = container.querySelector('div.flex.flex-wrap') as HTMLElement

    expect(within(diagram).queryByText('Suspendido')).not.toBeInTheDocument()
  })
})
