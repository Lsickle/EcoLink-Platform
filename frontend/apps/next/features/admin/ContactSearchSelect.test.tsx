import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { ContactSearchSelect } from './ContactSearchSelect'

const searchContactsMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    searchContacts: (...args: unknown[]) => searchContactsMock(...args),
  }
})

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 10 }

describe('ContactSearchSelect', () => {
  beforeEach(() => {
    searchContactsMock.mockResolvedValue(emptyPage)
  })

  afterEach(() => {
    searchContactsMock.mockReset()
  })

  // Gap de UX documentado: sin el cargo visible, el usuario no puede
  // distinguir quién tiene el cargo "Conductor" al buscar un contacto para
  // registrar Personal de Transporte (ver CreateTransportPersonnelForm.tsx).
  test('shows the position_title alongside name and document when present', async () => {
    searchContactsMock.mockResolvedValue({
      data: [
        { id: 42, first_name: 'Juan', last_name: 'Pérez', document_number: '123456', email: null, position_title: 'Conductor' },
      ],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 10,
    })
    render(
      <ContactSearchSelect
        label="Contacto"
        htmlId="contact"
        selectedId={null}
        selectedLabel={null}
        onSelect={() => {}}
        onClear={() => {}}
      />
    )

    fireEvent.change(screen.getByLabelText('Contacto'), { target: { value: 'Juan' } })

    expect(await screen.findByText(/Juan Pérez/)).toBeInTheDocument()
    expect(screen.getByText(/123456/)).toBeInTheDocument()
    expect(screen.getByText(/Conductor/)).toBeInTheDocument()
  })

  test('shows a fallback when position_title is null', async () => {
    searchContactsMock.mockResolvedValue({
      data: [
        { id: 7, first_name: 'Ana', last_name: 'Ríos', document_number: '999', email: null, position_title: null },
      ],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 10,
    })
    render(
      <ContactSearchSelect
        label="Contacto"
        htmlId="contact"
        selectedId={null}
        selectedLabel={null}
        onSelect={() => {}}
        onClear={() => {}}
      />
    )

    fireEvent.change(screen.getByLabelText('Contacto'), { target: { value: 'Ana' } })

    expect(await screen.findByText(/Ana Ríos/)).toBeInTheDocument()
    expect(screen.getByText(/Sin cargo registrado/)).toBeInTheDocument()
  })

  // Caso de uso "Generar Manifiesto de Cargue" (buscar el firmante del
  // Generador de una `transport_schedule` puntual, no de la organización del
  // actor) -- ver `OrganizationController::searchContacts()`.
  describe('scoped to a transport_schedule (transportScheduleId prop)', () => {
    test('forwards transportScheduleId to searchContacts and shows a scoped placeholder before typing', async () => {
      render(
        <ContactSearchSelect
          label="Firmante del Generador"
          htmlId="signer"
          selectedId={null}
          selectedLabel={null}
          onSelect={() => {}}
          onClear={() => {}}
          transportScheduleId={9}
        />
      )

      expect(screen.getByPlaceholderText('Escribe para buscar contactos del Generador…')).toBeInTheDocument()
      expect(searchContactsMock).not.toHaveBeenCalled()

      fireEvent.change(screen.getByLabelText('Firmante del Generador'), { target: { value: 'María' } })

      await waitFor(() =>
        expect(searchContactsMock).toHaveBeenCalledWith({ q: 'María', perPage: 10, transportScheduleId: 9 })
      )
    })

    // El 422 "falta q" no debería ocurrir (el input nunca busca con q vacío),
    // pero si llegara a pasar no debe mostrarse como un error crudo al
    // usuario -- se ignora en silencio, igual que un resultado vacío.
    test('silently ignores a 422 ApiValidationError (missing q)', async () => {
      searchContactsMock.mockRejectedValue(new ApiValidationError('Error de validación.', { q: ['El campo q es obligatorio.'] }))
      render(
        <ContactSearchSelect
          label="Firmante del Generador"
          htmlId="signer"
          selectedId={null}
          selectedLabel={null}
          onSelect={() => {}}
          onClear={() => {}}
          transportScheduleId={9}
        />
      )

      fireEvent.change(screen.getByLabelText('Firmante del Generador'), { target: { value: 'x' } })

      await waitFor(() => expect(searchContactsMock).toHaveBeenCalled())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByText(/obligatorio/)).not.toBeInTheDocument()
    })

    // 403 (`No tiene acceso a esta programación de transporte.`) / 404
    // (programación inexistente) sí deben mostrarse -- son accionables.
    test('shows a clear error message for a 403/404 (non-validation) failure', async () => {
      searchContactsMock.mockRejectedValue(new Error('No tiene acceso a esta programación de transporte.'))
      render(
        <ContactSearchSelect
          label="Firmante del Generador"
          htmlId="signer"
          selectedId={null}
          selectedLabel={null}
          onSelect={() => {}}
          onClear={() => {}}
          transportScheduleId={9}
        />
      )

      fireEvent.change(screen.getByLabelText('Firmante del Generador'), { target: { value: 'María' } })

      expect(await screen.findByRole('alert')).toHaveTextContent('No tiene acceso a esta programación de transporte.')
    })
  })
})
