import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { CreateWasteStreamForm } from './CreateWasteStreamForm'

const createWasteStreamMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createWasteStream: (...args: unknown[]) => createWasteStreamMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

describe('CreateWasteStreamForm', () => {
  beforeEach(() => {
    createWasteStreamMock.mockResolvedValue({
      waste_stream: { id: 42, code: 'A9999', name: 'Prueba', tipo: 'A' },
    })
  })

  afterEach(() => {
    createWasteStreamMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the waste_streams.read permission via useRequireAuth', () => {
    render(<CreateWasteStreamForm />)
    expect(useRequireAuthMock).toHaveBeenCalledWith('waste_streams.read')
  })

  test('shows field errors and does not submit when code/name are empty', async () => {
    render(<CreateWasteStreamForm />)

    fireEvent.click(screen.getByRole('button', { name: /crear corriente/i }))

    expect(await screen.findByText('Ingresa un código.')).toBeInTheDocument()
    expect(createWasteStreamMock).not.toHaveBeenCalled()
  })

  test('defaults tipo to "Y" and submits the payload with the selected tipo', async () => {
    render(<CreateWasteStreamForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'A9999' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Prueba' } })

    fireEvent.click(screen.getByRole('combobox', { name: 'Tipo (Y/A)' }))
    const option = await screen.findByRole('option', { name: 'A' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear corriente/i }))
    })

    expect(createWasteStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'A9999', name: 'Prueba', tipo: 'A', requires_manifest: true, requires_special_transport: false })
    )
    expect(pushMock).toHaveBeenCalledWith('/admin/waste-streams/42')
  })

  test('shows the API error (e.g. duplicate code) without navigating', async () => {
    createWasteStreamMock.mockRejectedValueOnce(
      new ApiValidationError('Error de validación.', { code: ['El código ya está en uso.'] })
    )
    render(<CreateWasteStreamForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'Y8' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Duplicado' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear corriente/i }))
    })

    expect(await screen.findByText('El código ya está en uso.')).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })

  test('navigates back to the list when clicking "Cancelar"', () => {
    render(<CreateWasteStreamForm />)

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(pushMock).toHaveBeenCalledWith('/admin/waste-streams')
  })
})
