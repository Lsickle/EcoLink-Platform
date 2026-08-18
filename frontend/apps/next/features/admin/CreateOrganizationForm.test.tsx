import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { CreateOrganizationForm } from './CreateOrganizationForm'

const createOrganizationMock = vi.fn()
const fetchCountriesMock = vi.fn()
const searchOrganizationsMock = vi.fn()
const fetchBusinessRolesMock = vi.fn()
const fetchOrganizationStatusesMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createOrganization: (...args: unknown[]) => createOrganizationMock(...args),
    fetchCountries: (...args: unknown[]) => fetchCountriesMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
    fetchBusinessRoles: (...args: unknown[]) => fetchBusinessRolesMock(...args),
    fetchOrganizationStatuses: (...args: unknown[]) => fetchOrganizationStatusesMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const useRequireAuthMock = vi.fn<
  (permission?: string, options?: { requirePlatformStaff?: boolean }) => {
    user: { id: number } | null
    isLoading: boolean
    isAuthorized: boolean
  }
>(() => ({ user: { id: 1 }, isLoading: false, isAuthorized: true }))

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string, options?: { requirePlatformStaff?: boolean }) =>
    useRequireAuthMock(permission, options),
}))

describe('CreateOrganizationForm', () => {
  beforeEach(() => {
    fetchCountriesMock.mockResolvedValue({
      data: [{ id: 1, uuid: 'c-1', iso_code: 'CO', name: 'Colombia', is_active: true, created_at: '', updated_at: '' }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 300,
    })
    searchOrganizationsMock.mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 10 })
    fetchBusinessRolesMock.mockResolvedValue({
      data: [
        { id: 1, code: 'GENERATOR', name: 'Generador', description: null, sort_order: 1, is_active: true, can_treat_waste: false },
        { id: 2, code: 'GESTOR', name: 'Gestor', description: null, sort_order: 2, is_active: true, can_treat_waste: true },
      ],
    })
    fetchOrganizationStatusesMock.mockResolvedValue({
      data: [
        { id: 1, code: 'PRO', name: 'PROSPECTO', color_hex: '#3d75dc', sort_order: 1, is_active: true },
        { id: 2, code: 'ACT', name: 'ACTIVA', color_hex: '#228b33', sort_order: 2, is_active: true },
      ],
    })
  })

  afterEach(() => {
    createOrganizationMock.mockReset()
    fetchCountriesMock.mockReset()
    searchOrganizationsMock.mockReset()
    fetchBusinessRolesMock.mockReset()
    fetchOrganizationStatusesMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires platform staff via useRequireAuth, without a specific permission', async () => {
    render(<CreateOrganizationForm />)
    await screen.findByLabelText('Razón Social')

    expect(useRequireAuthMock).toHaveBeenCalledWith(undefined, { requirePlatformStaff: true })
  })

  test('does not render the form when the user is not platform staff', () => {
    useRequireAuthMock.mockReturnValueOnce({ user: null, isLoading: false, isAuthorized: false })
    render(<CreateOrganizationForm />)

    expect(screen.queryByText('Crear Organización')).not.toBeInTheDocument()
  })

  test('shows a validation error when legal_name is missing', async () => {
    render(<CreateOrganizationForm />)
    await screen.findByLabelText('Razón Social')
    // Espera a que carguen los catálogos "Tipo de Organización"/"Estado"
    // (fetchBusinessRoles/fetchOrganizationStatuses, async) -- el botón de
    // envío queda deshabilitado hasta entonces (ver catalogsLoading).
    await screen.findByRole('checkbox', { name: 'Generador' })

    fireEvent.change(screen.getByLabelText('NIT / Identificación Tributaria'), { target: { value: '900123456-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear Organización' }))

    expect(await screen.findByText('Ingresa la razón social.')).toBeInTheDocument()
    expect(createOrganizationMock).not.toHaveBeenCalled()
  })

  // `email` REQUERIDO desde la creación (decisión del usuario, 2026-08-13) --
  // ver docblock de `createOrganizationSchema` en schemas.ts.
  test('shows a validation error when email is missing', async () => {
    render(<CreateOrganizationForm />)
    await screen.findByLabelText('Razón Social')
    await screen.findByRole('checkbox', { name: 'Generador' })

    fireEvent.change(screen.getByLabelText('Razón Social'), { target: { value: 'EcoRecicla S.A.S.' } })
    fireEvent.change(screen.getByLabelText('NIT / Identificación Tributaria'), { target: { value: '900123456-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear Organización' }))

    expect(await screen.findByText('Ingresa el correo electrónico.')).toBeInTheDocument()
    expect(createOrganizationMock).not.toHaveBeenCalled()
  })

  test('submits the form with the required fields and navigates to the new detail screen', async () => {
    createOrganizationMock.mockResolvedValueOnce({ organization: { id: 42, legal_name: 'EcoRecicla S.A.S.' } })
    render(<CreateOrganizationForm />)
    await screen.findByLabelText('Razón Social')
    await screen.findByRole('checkbox', { name: 'Generador' })

    fireEvent.change(screen.getByLabelText('Razón Social'), { target: { value: 'EcoRecicla S.A.S.' } })
    fireEvent.change(screen.getByLabelText('NIT / Identificación Tributaria'), { target: { value: '900123456-1' } })
    fireEvent.change(screen.getByLabelText('Correo Electrónico'), { target: { value: 'contacto@ecorecicla.com' } })

    fireEvent.click(screen.getByRole('button', { name: 'Crear Organización' }))

    await Promise.resolve()
    expect(createOrganizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        legal_name: 'EcoRecicla S.A.S.',
        tax_id: '900123456-1',
        tax_id_type: 'NIT',
        email: 'contacto@ecorecicla.com',
        timezone: 'America/Bogota',
        currency_code: 'COP',
      })
    )
    expect(pushMock).toHaveBeenCalledWith('/admin/organizations/42')
  })

  test('shows the backend validation error (e.g. duplicate tax_id) without navigating', async () => {
    createOrganizationMock.mockRejectedValueOnce(
      new ApiValidationError('Error de validación.', { tax_id: ['Ya existe una organización con este NIT.'] })
    )
    render(<CreateOrganizationForm />)
    await screen.findByLabelText('Razón Social')
    await screen.findByRole('checkbox', { name: 'Generador' })

    fireEvent.change(screen.getByLabelText('Razón Social'), { target: { value: 'EcoRecicla S.A.S.' } })
    fireEvent.change(screen.getByLabelText('NIT / Identificación Tributaria'), { target: { value: '900123456-1' } })
    fireEvent.change(screen.getByLabelText('Correo Electrónico'), { target: { value: 'contacto@ecorecicla.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear Organización' }))

    expect(await screen.findByText('Ya existe una organización con este NIT.')).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })

  test('toggles a "Tipo de Organización" checkbox', async () => {
    render(<CreateOrganizationForm />)
    await screen.findByLabelText('Razón Social')

    const checkbox = await screen.findByRole('checkbox', { name: 'Generador' })
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
  })

  // Punto 2 del lote de correcciones -- "Organización Matriz" debe usar
  // OrganizationQuickSelect (carga completa al montar, filtra en memoria),
  // no OrganizationSearchSelect (debounce + red por tecla, sin opciones al
  // solo hacer focus). Mismo patrón de test que OrganizationQuickSelect.test.tsx.
  test('shows "Organización Matriz" options on focus, without typing (OrganizationQuickSelect)', async () => {
    searchOrganizationsMock.mockResolvedValue({
      data: [{ id: 5, legal_name: 'Matriz Nacional S.A.S.', tax_id: '800111222-3' }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 50,
    })
    render(<CreateOrganizationForm />)
    await screen.findByLabelText('Razón Social')
    await screen.findByRole('checkbox', { name: 'Generador' })

    const input = screen.getByLabelText('Organización Matriz (opcional)')
    fireEvent.focus(input)

    expect(await screen.findByText(/Matriz Nacional/)).toBeInTheDocument()
    // Carga completa una sola vez, sin `q` (a diferencia del debounce de
    // OrganizationSearchSelect).
    expect(searchOrganizationsMock.mock.calls[0][0]).not.toHaveProperty('q')
  })

  // Punto 3 del lote de correcciones -- País por defecto Colombia, buscado
  // explícitamente por `iso_code === 'CO'` (no el primero del array).
  test('defaults "País" to Colombia even when it is not the first country in the catalog', async () => {
    fetchCountriesMock.mockResolvedValue({
      data: [
        { id: 2, uuid: 'c-2', iso_code: 'MX', name: 'México', is_active: true, created_at: '', updated_at: '' },
        { id: 1, uuid: 'c-1', iso_code: 'CO', name: 'Colombia', is_active: true, created_at: '', updated_at: '' },
      ],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 300,
    })
    render(<CreateOrganizationForm />)
    await screen.findByLabelText('Razón Social')
    await screen.findByRole('checkbox', { name: 'Generador' })

    expect(await screen.findByRole('combobox', { name: 'País' })).toHaveTextContent('Colombia')
  })

  // ---------------------------------------------------------------------
  // Marca operativo/referencia DESDE EL ALTA (2026-08-18).
  //
  // Antes solo se podía fijar en un segundo paso, desde el detalle: la
  // columna nace en `true` y `syncBusinessRoles()` no la tocaba. Olvidar ese
  // paso fallaba en silencio -- el Gestor de referencia no aparecía en el
  // selector de asignación delegada, y encima se le podían pedir evaluaciones
  // que nadie iba a atender, porque no tiene usuarios aquí.
  // ---------------------------------------------------------------------
  describe('marca operativo / de referencia', () => {
    // Se resuelve por la CAPACIDAD del rol (`can_treat_waste`), igual que en
    // el backend -- a quien no trata residuos la marca no le significa nada.
    test('el interruptor solo aparece al marcar un tipo que trata residuos', async () => {
      render(<CreateOrganizationForm />)
      await screen.findByRole('checkbox', { name: 'Generador' })

      expect(screen.queryByRole('checkbox', { name: 'Este Gestor opera dentro de EcoLink' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('checkbox', { name: 'Generador' }))
      expect(screen.queryByRole('checkbox', { name: 'Este Gestor opera dentro de EcoLink' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('checkbox', { name: 'Gestor' }))
      expect(screen.getByRole('checkbox', { name: 'Este Gestor opera dentro de EcoLink' })).toBeInTheDocument()
    })

    test('arranca marcado: el Gestor que opera aquí es la vía normal', async () => {
      render(<CreateOrganizationForm />)
      await screen.findByRole('checkbox', { name: 'Gestor' })
      fireEvent.click(screen.getByRole('checkbox', { name: 'Gestor' }))

      expect(screen.getByRole('checkbox', { name: 'Este Gestor opera dentro de EcoLink' })).toBeChecked()
      expect(screen.getByText(/Sus usuarios entran a la plataforma/i)).toBeInTheDocument()
    })

    test('desmarcarlo explica qué es un Gestor de referencia', async () => {
      render(<CreateOrganizationForm />)
      await screen.findByRole('checkbox', { name: 'Gestor' })
      fireEvent.click(screen.getByRole('checkbox', { name: 'Gestor' }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Este Gestor opera dentro de EcoLink' }))

      expect(screen.getByText(/maneja todo en su propia plataforma y no tiene usuarios aquí/i)).toBeInTheDocument()
      expect(screen.getByText(/asignación delegada/i)).toBeInTheDocument()
    })

    test('envía gestor_operates_in_platform: false al crear un Gestor de referencia', async () => {
      createOrganizationMock.mockResolvedValueOnce({ organization: { id: 51, legal_name: 'Gestor Externo S.A.S.' } })
      render(<CreateOrganizationForm />)
      await screen.findByRole('checkbox', { name: 'Gestor' })

      fireEvent.change(screen.getByLabelText('Razón Social'), { target: { value: 'Gestor Externo S.A.S.' } })
      fireEvent.change(screen.getByLabelText('NIT / Identificación Tributaria'), { target: { value: '900555444-1' } })
      fireEvent.change(screen.getByLabelText('Correo Electrónico'), { target: { value: 'contacto@externo.com' } })
      fireEvent.click(screen.getByRole('checkbox', { name: 'Gestor' }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Este Gestor opera dentro de EcoLink' }))

      fireEvent.click(screen.getByRole('button', { name: 'Crear Organización' }))

      await vi.waitFor(() =>
        expect(createOrganizationMock).toHaveBeenCalledWith(
          expect.objectContaining({ business_role_ids: [2], gestor_operates_in_platform: false })
        )
      )
    })

    // Sin un tipo que trate residuos, el payload no debe insinuar una decisión
    // que nadie tomó: el backend la ignoraría igual, pero el registro queda
    // más honesto.
    test('NO envía la marca si ningún tipo marcado trata residuos', async () => {
      createOrganizationMock.mockResolvedValueOnce({ organization: { id: 52, legal_name: 'Solo Generador S.A.S.' } })
      render(<CreateOrganizationForm />)
      await screen.findByRole('checkbox', { name: 'Generador' })

      fireEvent.change(screen.getByLabelText('Razón Social'), { target: { value: 'Solo Generador S.A.S.' } })
      fireEvent.change(screen.getByLabelText('NIT / Identificación Tributaria'), { target: { value: '900111222-1' } })
      fireEvent.change(screen.getByLabelText('Correo Electrónico'), { target: { value: 'contacto@generador.com' } })
      fireEvent.click(screen.getByRole('checkbox', { name: 'Generador' }))

      fireEvent.click(screen.getByRole('button', { name: 'Crear Organización' }))

      await vi.waitFor(() =>
        expect(createOrganizationMock).toHaveBeenCalledWith(
          expect.objectContaining({ gestor_operates_in_platform: undefined })
        )
      )
    })
  })
})
