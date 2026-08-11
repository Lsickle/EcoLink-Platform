import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ChangePasswordForm } from './ChangePasswordForm'

const changePasswordMock = vi.fn()
const refreshMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/auth/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/auth/api')>()
  return {
    ...actual,
    changePassword: (...args: unknown[]) => changePasswordMock(...args),
  }
})

let currentUser: { id: number; username: string; must_change_password?: boolean } | null = {
  id: 1,
  username: 'ana',
  must_change_password: false,
}

vi.mock('app/provider/auth', () => ({
  useRequireAuth: () => ({ user: currentUser, isLoading: false, refresh: refreshMock }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'OldPassw0rd1' } })
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'NewPassw0rd2' } })
  fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), { target: { value: 'NewPassw0rd2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }))
}

// Cambio de contraseña obligatorio en el primer login (confirmado por el
// usuario, 2026-08-11) -- mismo formulario/componente para ambos modos
// (voluntario vía menú de usuario, obligatorio vía redirect de
// useRequireAuth()), copy y comportamiento post-éxito condicionales a
// `user.must_change_password`.
describe('ChangePasswordForm', () => {
  beforeEach(() => {
    currentUser = { id: 1, username: 'ana', must_change_password: false }
  })

  afterEach(() => {
    changePasswordMock.mockReset()
    refreshMock.mockReset()
    pushMock.mockReset()
  })

  test('modo voluntario: muestra el botón "Volver" y el copy genérico', () => {
    render(<ChangePasswordForm />)

    expect(screen.getByText('Actualiza la contraseña de tu cuenta EcoLink')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument()
  })

  test('modo voluntario: tras éxito, muestra el mensaje inline y NO navega', async () => {
    changePasswordMock.mockResolvedValue({ message: 'Contraseña actualizada.' })
    render(<ChangePasswordForm />)

    fillAndSubmit()

    expect(await screen.findByText('Contraseña actualizada.')).toBeInTheDocument()
    expect(refreshMock).not.toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
  })

  test('modo obligatorio (must_change_password=true): oculta "Volver" y muestra el copy de contraseña temporal', () => {
    currentUser = { id: 1, username: 'ana', must_change_password: true }
    render(<ChangePasswordForm />)

    expect(
      screen.getByText('Tu cuenta se creó con una contraseña temporal -- debes cambiarla antes de continuar.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Volver' })).not.toBeInTheDocument()
  })

  test('modo obligatorio: tras éxito, refresca la sesión y navega a /', async () => {
    currentUser = { id: 1, username: 'ana', must_change_password: true }
    changePasswordMock.mockResolvedValue({ message: 'Contraseña actualizada.' })
    refreshMock.mockResolvedValue(undefined)
    render(<ChangePasswordForm />)

    fillAndSubmit()

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1))
    expect(pushMock).toHaveBeenCalledWith('/')
  })
})
