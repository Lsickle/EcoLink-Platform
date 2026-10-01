import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { TransportScheduleCalendarScreen } from './TransportScheduleCalendarScreen'

let isAuthorized = true

vi.mock('app/provider/auth', () => ({
  useRequireAuth: () => ({ isAuthorized, user: null, isLoading: false }),
}))

// El workspace real monta FullCalendar (manipulación de DOM real, requiere
// navegador) -- se sustituye por un stub para probar solo el gate de
// permiso y el wiring de `dynamic(..., { ssr: false })` de esta pantalla.
// El comportamiento del calendario en sí (drag-and-drop, modal, vistas) se
// prueba por separado en `useTransportScheduleCalendarState.test.ts`,
// `PendingRequestsPanel.test.tsx` y `ScheduleAssignmentDialog.test.tsx`, y
// se verifica manualmente en el navegador (`yarn dev`) -- FullCalendar
// depende de APIs de layout/DOM sin soporte confiable en jsdom.
vi.mock('./TransportScheduleCalendarWorkspace', () => ({
  TransportScheduleCalendarWorkspace: () => <div>workspace-stub</div>,
}))

describe('TransportScheduleCalendarScreen', () => {
  test('shows a loading state while unauthorized', () => {
    isAuthorized = false
    render(<TransportScheduleCalendarScreen />)

    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')
    expect(screen.queryByText('workspace-stub')).not.toBeInTheDocument()
  })

  test('lazily renders the calendar workspace once authorized', async () => {
    isAuthorized = true
    render(<TransportScheduleCalendarScreen />)

    expect(await screen.findByText('workspace-stub')).toBeInTheDocument()
  })
})
