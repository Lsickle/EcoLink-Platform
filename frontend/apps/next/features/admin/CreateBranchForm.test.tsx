import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { CreateBranchForm } from './CreateBranchForm'

const createBranchMock = vi.fn()
const fetchBranchTypesMock = vi.fn()
const fetchCountriesMock = vi.fn()
const fetchDepartmentsMock = vi.fn()
const fetchMunicipalitiesMock = vi.fn()
const fetchLocalitiesMock = vi.fn()
const searchOrganizationsMock = vi.fn()
const fetchOrganizationMock = vi.fn()
const pushMock = vi.fn()
let searchParams = new URLSearchParams()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createBranch: (...args: unknown[]) => createBranchMock(...args),
    fetchBranchTypes: (...args: unknown[]) => fetchBranchTypesMock(...args),
    fetchCountries: (...args: unknown[]) => fetchCountriesMock(...args),
    fetchDepartments: (...args: unknown[]) => fetchDepartmentsMock(...args),
    fetchMunicipalities: (...args: unknown[]) => fetchMunicipalitiesMock(...args),
    fetchLocalities: (...args: unknown[]) => fetchLocalitiesMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
    fetchOrganization: (...args: unknown[]) => fetchOrganizationMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParams,
}))

let currentUser: { id: number; is_platform_staff: boolean } | null = { id: 1, is_platform_staff: false }

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

// Selects encadenados (País -> Departamento -> Municipio -> Localidad)
// requieren `pointerdown` además de `click` para que Base UI Select
// (`@base-ui/react/select`) confirme la selección de forma confiable en
// jsdom cuando se abre un segundo Select justo después de cerrar el
// anterior -- mismo patrón ya usado en LocalitiesListScreen.test.tsx.
async function selectOption(option: HTMLElement) {
  await act(async () => {
    fireEvent.pointerDown(option)
    fireEvent.click(option)
  })
}

describe('CreateBranchForm', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false }
    searchParams = new URLSearchParams()
    fetchBranchTypesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 1, uuid: 'bt-1', code: 'OPS', name: 'Operativa', category: 'A', is_logistics: false, is_storage: false, is_treatment: false, is_dispatch: false, sort_order: 1, is_active: true, created_at: '', updated_at: '' }],
    })
    fetchCountriesMock.mockResolvedValue({ ...emptyPage, data: [{ id: 1, uuid: 'c-1', iso_code: 'CO', name: 'Colombia', is_active: true, created_at: '', updated_at: '' }] })
    fetchDepartmentsMock.mockResolvedValue({ ...emptyPage, data: [{ id: 5, uuid: 'd-5', country_id: 1, dane_code: '11', name: 'Cundinamarca', is_active: true, created_at: '', updated_at: '' }] })
    fetchMunicipalitiesMock.mockResolvedValue(emptyPage)
    fetchLocalitiesMock.mockResolvedValue(emptyPage)
    searchOrganizationsMock.mockResolvedValue(emptyPage)
    fetchOrganizationMock.mockResolvedValue({
      organization: { id: 1, legal_name: 'Organización de prueba', tax_id: '900000000-1' },
    })
  })

  afterEach(() => {
    createBranchMock.mockReset()
    fetchBranchTypesMock.mockReset()
    fetchCountriesMock.mockReset()
    fetchDepartmentsMock.mockReset()
    fetchMunicipalitiesMock.mockReset()
    fetchLocalitiesMock.mockReset()
    searchOrganizationsMock.mockReset()
    fetchOrganizationMock.mockReset()
    pushMock.mockReset()
  })

  test('hides the "Organización dueña" selector for a non-platform-staff actor', async () => {
    render(<CreateBranchForm />)
    await screen.findByLabelText('Nombre')

    expect(screen.queryByLabelText('Organización dueña')).not.toBeInTheDocument()
  })

  test('shows the "Organización dueña" selector for platform staff', async () => {
    currentUser = { id: 1, is_platform_staff: true }
    render(<CreateBranchForm />)

    expect(await screen.findByLabelText('Organización dueña')).toBeInTheDocument()
  })

  test('requires a name and branch type before submitting', async () => {
    render(<CreateBranchForm />)
    await screen.findByLabelText('Nombre')

    fireEvent.click(screen.getByRole('button', { name: 'Crear Sucursal' }))

    expect(await screen.findByText('Ingresa un nombre.')).toBeInTheDocument()
    expect(createBranchMock).not.toHaveBeenCalled()
  })

  test('creates a branch for a non-platform-staff actor without organization_id', async () => {
    createBranchMock.mockResolvedValueOnce({ branch: { id: 99 } })
    render(<CreateBranchForm />)
    await screen.findByLabelText('Nombre')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Planta Norte' } })
    fireEvent.change(screen.getByLabelText(/código/i), { target: { value: 'S-001' } })
    fireEvent.click(screen.getByRole('combobox', { name: /tipo de sucursal/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Operativa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear Sucursal' }))

    await vi.waitFor(() => expect(createBranchMock).toHaveBeenCalled())
    expect(createBranchMock).toHaveBeenCalledWith(expect.not.objectContaining({ organization_id: expect.anything() }))
    expect(pushMock).toHaveBeenCalledWith('/admin/branches/99')
  })

  // Punto 5 del lote de correcciones (2026-08-09) -- `code` es opcional
  // (esquema-bd: `branches.code VARCHAR(50) NULL`, backend ya migrado a
  // `nullable`). Se envía `undefined`, no `''`, para no chocar contra el
  // índice único parcial (múltiples NULL sí conviven, múltiples '' no).
  test('creates a branch without filling "Código" (optional)', async () => {
    createBranchMock.mockResolvedValueOnce({ branch: { id: 100 } })
    render(<CreateBranchForm />)
    await screen.findByLabelText('Nombre')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Planta Sur' } })
    fireEvent.click(screen.getByRole('combobox', { name: /tipo de sucursal/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Operativa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear Sucursal' }))

    await vi.waitFor(() => expect(createBranchMock).toHaveBeenCalled())
    const [payload] = createBranchMock.mock.calls[0]
    expect(payload.code).toBeUndefined()
    expect(pushMock).toHaveBeenCalledWith('/admin/branches/100')
  })

  // Punto 4 del lote de correcciones -- el label debe mostrar el nombre real
  // de la organización (vía fetchOrganization()), no el placeholder
  // "Organización #N" que nunca se reemplazaba.
  test('pre-fills the organization from the organizationId query param for platform staff, resolving the real name', async () => {
    currentUser = { id: 1, is_platform_staff: true }
    searchParams = new URLSearchParams('organizationId=7')
    fetchOrganizationMock.mockResolvedValueOnce({
      organization: { id: 7, legal_name: 'EcoRecicla S.A.S.', tax_id: '900123456-1' },
    })
    render(<CreateBranchForm />)

    expect(await screen.findByText('EcoRecicla S.A.S. (900123456-1)')).toBeInTheDocument()
    expect(screen.queryByText('Organización #7')).not.toBeInTheDocument()
    expect(fetchOrganizationMock).toHaveBeenCalledWith(7)
  })

  test('does not break the form when fetchOrganization fails for the ?organizationId= query param', async () => {
    currentUser = { id: 1, is_platform_staff: true }
    searchParams = new URLSearchParams('organizationId=7')
    fetchOrganizationMock.mockRejectedValueOnce(new Error('not found'))
    render(<CreateBranchForm />)

    await screen.findByLabelText('Nombre')
    // Sin organización preseleccionada -- el resto del formulario sigue
    // usable (selector "Organización dueña" visible, sin valor).
    expect(await screen.findByLabelText('Organización dueña')).toBeInTheDocument()
  })

  test('shows the backend validation error on a duplicate code', async () => {
    createBranchMock.mockRejectedValueOnce(
      new ApiValidationError('The given data was invalid.', { code: ['Ya existe una sucursal con este código en la organización.'] })
    )
    render(<CreateBranchForm />)
    await screen.findByLabelText('Nombre')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Planta Norte' } })
    fireEvent.change(screen.getByLabelText(/código/i), { target: { value: 'S-001' } })
    fireEvent.click(screen.getByRole('combobox', { name: /tipo de sucursal/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Operativa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear Sucursal' }))

    expect(await screen.findByText('Ya existe una sucursal con este código en la organización.')).toBeInTheDocument()
  })

  // Punto 6 del lote de correcciones -- "Tipo de Sucursal" por defecto
  // "Administrativa" (code ADM), sin pisar una selección ya hecha por el
  // usuario.
  test('defaults "Tipo de Sucursal" to Administrativa (ADM) once branchTypes load', async () => {
    fetchBranchTypesMock.mockResolvedValueOnce({
      ...emptyPage,
      data: [
        { id: 1, uuid: 'bt-1', code: 'OPS', name: 'Operativa', category: 'A', is_logistics: false, is_storage: false, is_treatment: false, is_dispatch: false, sort_order: 1, is_active: true, created_at: '', updated_at: '' },
        { id: 2, uuid: 'bt-2', code: 'ADM', name: 'Administrativa', category: 'A', is_logistics: false, is_storage: false, is_treatment: false, is_dispatch: false, sort_order: 2, is_active: true, created_at: '', updated_at: '' },
      ],
    })
    render(<CreateBranchForm />)
    await screen.findByLabelText('Nombre')

    expect(await screen.findByRole('combobox', { name: /tipo de sucursal/i })).toHaveTextContent('Administrativa')
  })

  // Punto 7 del lote de correcciones -- mismo criterio de punto 3
  // (CreateOrganizationForm), pero aquí el default visual previo era "Sin
  // especificar".
  test('defaults "País" to Colombia once countries load', async () => {
    render(<CreateBranchForm />)
    await screen.findByLabelText('Nombre')

    expect(await screen.findByRole('combobox', { name: /país/i })).toHaveTextContent('Colombia')
  })

  // Punto 8 del lote de correcciones -- reordenamiento CLIENT-SIDE de
  // Departamento: "BOGOTÁ D.C." primero, luego "CUNDINAMARCA", resto en el
  // orden ya devuelto por el backend (alfabético). También confirma
  // (posible falso reporte) que Departamento sigue siendo opcional: el país
  // ya queda seleccionado (Colombia por defecto, punto 7) sin forzar
  // ninguna selección de departamento.
  test('reorders "Departamento" so BOGOTÁ D.C. and CUNDINAMARCA appear first', async () => {
    fetchDepartmentsMock.mockResolvedValue({
      ...emptyPage,
      data: [
        { id: 1, uuid: 'd-1', country_id: 1, dane_code: '05', name: 'ANTIOQUIA', is_active: true, created_at: '', updated_at: '' },
        { id: 2, uuid: 'd-2', country_id: 1, dane_code: '25', name: 'CUNDINAMARCA', is_active: true, created_at: '', updated_at: '' },
        { id: 3, uuid: 'd-3', country_id: 1, dane_code: '11', name: 'BOGOTÁ D.C.', is_active: true, created_at: '', updated_at: '' },
        { id: 4, uuid: 'd-4', country_id: 1, dane_code: '76', name: 'VALLE DEL CAUCA', is_active: true, created_at: '', updated_at: '' },
      ],
    })
    render(<CreateBranchForm />)
    await screen.findByLabelText('Nombre')
    // País ya queda en Colombia por defecto (punto 7) -- dispara la carga
    // de departamentos sin ninguna interacción manual.
    await vi.waitFor(() => expect(fetchDepartmentsMock).toHaveBeenCalled())

    fireEvent.click(await screen.findByRole('combobox', { name: /departamento/i }))
    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Sin especificar',
      'BOGOTÁ D.C.',
      'CUNDINAMARCA',
      'ANTIOQUIA',
      'VALLE DEL CAUCA',
    ])
  })

  test('submits successfully without selecting Departamento/Municipio (already optional)', async () => {
    createBranchMock.mockResolvedValueOnce({ branch: { id: 50 } })
    render(<CreateBranchForm />)
    await screen.findByLabelText('Nombre')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Planta Norte' } })
    fireEvent.change(screen.getByLabelText(/código/i), { target: { value: 'S-001' } })
    fireEvent.click(screen.getByRole('combobox', { name: /tipo de sucursal/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Operativa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear Sucursal' }))

    await vi.waitFor(() => expect(createBranchMock).toHaveBeenCalled())
    expect(createBranchMock).toHaveBeenCalledWith(expect.not.objectContaining({ department_id: expect.anything(), municipality_id: expect.anything() }))
  })

  // Punto 10 del lote de correcciones -- Localidad solo visible/obligatoria
  // cuando el municipio elegido SÍ tiene localidades (dato real, no
  // comparación de string "Bogotá").
  test('hides "Localidad" when the selected municipality has no localities', async () => {
    fetchMunicipalitiesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 20, uuid: 'm-20', department_id: 5, codigo_dane: '25001', name: 'Agua de Dios', is_active: true, created_at: '', updated_at: '' }],
    })
    fetchLocalitiesMock.mockResolvedValue(emptyPage)
    createBranchMock.mockResolvedValueOnce({ branch: { id: 60 } })
    render(<CreateBranchForm />)
    await screen.findByLabelText('Nombre')
    // País ya queda en Colombia por defecto (punto 7) -- habilita el combo
    // de Departamento antes de interactuar con él.
    await vi.waitFor(() => expect(fetchDepartmentsMock).toHaveBeenCalled())

    fireEvent.click(await screen.findByRole('combobox', { name: /departamento/i }))
    await selectOption(await screen.findByRole('option', { name: 'Cundinamarca' }))
    fireEvent.click(await screen.findByRole('combobox', { name: /municipio/i }))
    await selectOption(await screen.findByRole('option', { name: 'Agua de Dios' }))

    await vi.waitFor(() => expect(fetchLocalitiesMock).toHaveBeenCalled())
    expect(screen.queryByLabelText(/Localidad/)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Planta Norte' } })
    fireEvent.change(screen.getByLabelText(/código/i), { target: { value: 'S-001' } })
    fireEvent.click(screen.getByRole('combobox', { name: /tipo de sucursal/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Operativa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear Sucursal' }))

    await vi.waitFor(() => expect(createBranchMock).toHaveBeenCalled())
  })

  test('requires "Localidad" and blocks submit when the selected municipality has localities', async () => {
    fetchMunicipalitiesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 30, uuid: 'm-30', department_id: 5, codigo_dane: '11001', name: 'Bogotá D.C.', is_active: true, created_at: '', updated_at: '' }],
    })
    fetchLocalitiesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 40, uuid: 'l-40', municipality_id: 30, name: 'Chapinero', is_active: true, created_at: '', updated_at: '' }],
    })
    render(<CreateBranchForm />)
    await screen.findByLabelText('Nombre')
    // País ya queda en Colombia por defecto (punto 7) -- habilita el combo
    // de Departamento antes de interactuar con él.
    await vi.waitFor(() => expect(fetchDepartmentsMock).toHaveBeenCalled())

    fireEvent.click(await screen.findByRole('combobox', { name: /departamento/i }))
    await selectOption(await screen.findByRole('option', { name: 'Cundinamarca' }))
    fireEvent.click(await screen.findByRole('combobox', { name: /municipio/i }))
    await selectOption(await screen.findByRole('option', { name: 'Bogotá D.C.' }))

    const localityCombobox = await screen.findByRole('combobox', { name: 'Localidad' })
    expect(localityCombobox).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Planta Norte' } })
    fireEvent.change(screen.getByLabelText(/código/i), { target: { value: 'S-001' } })
    fireEvent.click(screen.getByRole('combobox', { name: /tipo de sucursal/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Operativa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear Sucursal' }))

    expect(await screen.findByText('Selecciona una localidad.')).toBeInTheDocument()
    expect(createBranchMock).not.toHaveBeenCalled()

    fireEvent.click(localityCombobox)
    await selectOption(await screen.findByRole('option', { name: 'Chapinero' }))
    createBranchMock.mockResolvedValueOnce({ branch: { id: 70 } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear Sucursal' }))

    await vi.waitFor(() => expect(createBranchMock).toHaveBeenCalled())
  })

  // Punto 11 del lote de correcciones -- Capacidad Operativa por unidad
  // (KG/Litros/M³), 3 campos numéricos opcionales e independientes.
  test('submits operational capacity as 3 independent optional fields (kg/liters/m3)', async () => {
    createBranchMock.mockResolvedValueOnce({ branch: { id: 99 } })
    render(<CreateBranchForm />)
    await screen.findByLabelText('Nombre')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Planta Norte' } })
    fireEvent.change(screen.getByLabelText(/código/i), { target: { value: 'S-001' } })
    fireEvent.click(screen.getByRole('combobox', { name: /tipo de sucursal/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Operativa' }))

    fireEvent.change(screen.getByLabelText(/Capacidad Operativa \(Litros\)/), { target: { value: '500' } })

    fireEvent.click(screen.getByRole('button', { name: 'Crear Sucursal' }))

    await vi.waitFor(() => expect(createBranchMock).toHaveBeenCalled())
    const payload = createBranchMock.mock.calls[0][0]
    expect(payload.operational_capacity_liters).toBe(500)
    expect(payload.operational_capacity_kg).toBeUndefined()
    expect(payload.operational_capacity_m3).toBeUndefined()
  })
})
