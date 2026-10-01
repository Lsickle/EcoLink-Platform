import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ScheduleDateNavigator, toLocalDateString } from './ScheduleDateNavigator'

describe('toLocalDateString', () => {
  test('serializes using LOCAL time components, never toISOString (which can shift a day in UTC-negative zones)', () => {
    // 2026-09-30 23:30 hora local -- toISOString() de esta fecha en una
    // zona horaria al oeste de Greenwich (p.ej. America/Bogota, UTC-5)
    // podría seguir siendo el mismo día en UTC o no, según la hora; el
    // punto de esta prueba es que el resultado depende SOLO de
    // getFullYear/getMonth/getDate locales, nunca de toISOString().
    const date = new Date(2026, 8, 30, 23, 30, 0)
    expect(toLocalDateString(date)).toBe('2026-09-30')
  })

  test('pads single-digit months and days with a leading zero', () => {
    const date = new Date(2026, 0, 5)
    expect(toLocalDateString(date)).toBe('2026-01-05')
  })
})

describe('ScheduleDateNavigator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 30, 10, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('shows the currently selected date', () => {
    render(<ScheduleDateNavigator date={new Date(2026, 8, 30)} onDateChange={vi.fn()} />)
    expect(screen.getByText(/30 de septiembre de 2026/i)).toBeInTheDocument()
  })

  test('clicking the previous-day button moves the date back one day', () => {
    const onDateChange = vi.fn()
    render(<ScheduleDateNavigator date={new Date(2026, 8, 30)} onDateChange={onDateChange} />)

    fireEvent.click(screen.getByRole('button', { name: /día anterior/i }))

    const calledWith = onDateChange.mock.calls[0][0] as Date
    expect(toLocalDateString(calledWith)).toBe('2026-09-29')
  })

  test('clicking the next-day button moves the date forward one day', () => {
    const onDateChange = vi.fn()
    render(<ScheduleDateNavigator date={new Date(2026, 8, 30)} onDateChange={onDateChange} />)

    fireEvent.click(screen.getByRole('button', { name: /día siguiente/i }))

    const calledWith = onDateChange.mock.calls[0][0] as Date
    expect(toLocalDateString(calledWith)).toBe('2026-10-01')
  })

  test('clicking "Hoy" jumps to the current local date', () => {
    const onDateChange = vi.fn()
    render(<ScheduleDateNavigator date={new Date(2026, 8, 20)} onDateChange={onDateChange} />)

    fireEvent.click(screen.getByRole('button', { name: /^hoy$/i }))

    const calledWith = onDateChange.mock.calls[0][0] as Date
    expect(toLocalDateString(calledWith)).toBe('2026-09-30')
  })

})

// Aparte del resto -- Base UI Popover anima su apertura con temporizadores
// reales (requestAnimationFrame/setTimeout); con `vi.useFakeTimers()`
// activo (ver describe de arriba) `findByRole` nunca ve el cambio.
describe('ScheduleDateNavigator popover', () => {
  test('opens a calendar popover from the date trigger button', async () => {
    render(<ScheduleDateNavigator date={new Date(2026, 8, 30)} onDateChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /30 de septiembre de 2026/i }))

    expect(await screen.findByRole('grid')).toBeInTheDocument()
  })
})
