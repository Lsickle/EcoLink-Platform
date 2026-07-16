import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { SidebarProvider } from '@/components/ui/sidebar'
import { NavUser } from './nav-user'

// SidebarProvider depende de useIsMobile(), que usa matchMedia -- jsdom no
// lo implementa por defecto.
beforeAll(() => {
  window.matchMedia =
    window.matchMedia ??
    ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
})

const logoutMock = vi.fn()
const pushMock = vi.fn()
let mockUser: { username: string; email: string; person?: { full_name: string } } | null = null

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: mockUser, logout: logoutMock }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

function renderNavUser() {
  return render(
    <SidebarProvider>
      <NavUser />
    </SidebarProvider>
  )
}

// RN-181: NavUser deja de usar el usuario hardcodeado ("shadcn"/"m@example.com")
// del bloque dashboard-01 y consume la sesión real vía useAuth().
describe('NavUser', () => {
  afterEach(() => {
    logoutMock.mockReset()
    pushMock.mockReset()
    mockUser = null
  })

  test('shows the display name from person.full_name and the real email when available', () => {
    mockUser = { username: 'ana.gomez', email: 'ana@example.com', person: { full_name: 'Ana Gómez' } }
    renderNavUser()

    expect(screen.getByText('Ana Gómez')).toBeInTheDocument()
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
  })

  test('falls back to username when person is not loaded yet', () => {
    mockUser = { username: 'ana.gomez', email: 'ana@example.com' }
    renderNavUser()

    expect(screen.getByText('ana.gomez')).toBeInTheDocument()
  })

  test('calls logout() and redirects to /login when "Cerrar sesión" is clicked', async () => {
    mockUser = { username: 'ana.gomez', email: 'ana@example.com', person: { full_name: 'Ana Gómez' } }
    logoutMock.mockResolvedValueOnce(undefined)
    renderNavUser()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ana gómez/i }))
    })

    const logoutItem = await screen.findByText('Cerrar sesión')
    await act(async () => {
      fireEvent.click(logoutItem)
    })

    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith('/login')
  })

  test('navigates to /change-password when "Cambiar contraseña" is clicked', async () => {
    mockUser = { username: 'ana.gomez', email: 'ana@example.com', person: { full_name: 'Ana Gómez' } }
    renderNavUser()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ana gómez/i }))
    })

    const changePasswordItem = await screen.findByText('Cambiar contraseña')
    await act(async () => {
      fireEvent.click(changePasswordItem)
    })

    expect(pushMock).toHaveBeenCalledWith('/change-password')
  })
})
