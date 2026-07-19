import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
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
})
