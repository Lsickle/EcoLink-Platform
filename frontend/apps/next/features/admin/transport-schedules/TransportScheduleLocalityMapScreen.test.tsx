import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { TransportScheduleLocalityMapScreen } from './TransportScheduleLocalityMapScreen'

let isAuthorized = true

vi.mock('app/provider/auth', () => ({
  useRequireAuth: () => ({ isAuthorized, user: null, isLoading: false }),
}))

// El workspace real hace fetch de la API y monta react-simple-maps/Popover
// -- se sustituye por un stub para probar solo el gate de permiso y el
// wiring de `dynamic(..., { ssr: false })` de esta pantalla, mismo criterio
// ya usado por `TransportScheduleCalendarScreen.test.tsx`.
vi.mock('./TransportScheduleLocalityMapWorkspace', () => ({
  TransportScheduleLocalityMapWorkspace: () => <div>workspace-stub</div>,
}))

describe('TransportScheduleLocalityMapScreen', () => {
  test('shows a loading state while unauthorized', () => {
    isAuthorized = false
    render(<TransportScheduleLocalityMapScreen />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('workspace-stub')).not.toBeInTheDocument()
  })

  test('lazily renders the workspace once authorized', async () => {
    isAuthorized = true
    render(<TransportScheduleLocalityMapScreen />)

    expect(await screen.findByText('workspace-stub')).toBeInTheDocument()
  })
})
