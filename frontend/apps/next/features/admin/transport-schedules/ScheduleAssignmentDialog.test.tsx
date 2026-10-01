import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { ScheduleAssignmentDialog } from './ScheduleAssignmentDialog'
import type { PendingDropInfo } from './useTransportScheduleCalendarState'

function selectOption(triggerName: RegExp | string, optionName: RegExp | string) {
  fireEvent.click(screen.getByRole('combobox', { name: triggerName }))
  const option = screen.getByRole('option', { name: optionName })
  fireEvent.pointerDown(option)
  fireEvent.mouseDown(option)
  fireEvent.pointerUp(option)
  fireEvent.mouseUp(option)
  fireEvent.click(option)
}

const drivers = [
  { id: 1, uuid: 'a', organization_id: 10, person_id: 1, license_number: null, license_category: null, license_expiration_date: null, has_hazmat_permit: false, is_active: true, metadata: null, created_at: '', updated_at: '', person: { id: 1, full_name: 'Carlos Pérez', document_number: '1' } },
  { id: 2, uuid: 'b', organization_id: 10, person_id: 2, license_number: null, license_category: null, license_expiration_date: null, has_hazmat_permit: false, is_active: true, metadata: null, created_at: '', updated_at: '', person: { id: 2, full_name: 'Ana Gómez', document_number: '2' } },
] as never

const vehicles = [
  { id: 1, uuid: 'v1', organization_id: 10, branch_id: null, code: null, plate_number: 'ABC123', vin: null, vehicle_type_id: 1, brand: null, model: null, manufacturing_year: null, max_load_capacity: null, capacity_unit: 'kg', supports_hazmat: false, has_gps: false, operational_status: 'ACTIVE', soat_expiration_date: null, technical_inspection_expiration: null, is_active: true, created_at: '', updated_at: '', created_by: null, updated_by: null },
  { id: 2, uuid: 'v2', organization_id: 10, branch_id: null, code: null, plate_number: 'XYZ789', vin: null, vehicle_type_id: 1, brand: null, model: null, manufacturing_year: null, max_load_capacity: null, capacity_unit: 'kg', supports_hazmat: false, has_gps: false, operational_status: 'ACTIVE', soat_expiration_date: null, technical_inspection_expiration: null, is_active: true, created_at: '', updated_at: '', created_by: null, updated_by: null },
] as never

const branches = [{ id: 4, name: 'Planta de Tratamiento' }] as never

function makePendingDrop(overrides: Partial<PendingDropInfo> = {}): PendingDropInfo {
  return {
    request: {
      id: 1,
      uuid: 'uuid-1',
      organization_id: 10,
      request_code: 'SOL-2026-0142',
      requested_at: '2026-09-24T09:15:00-05:00',
      organization: { id: 10, legal_name: 'Textiles del Caribe S.A.S.' },
      branch: { id: 3, name: 'Bodega Central' },
    } as never,
    start: '2026-09-30T10:00:00-05:00',
    allDay: false,
    isLoadingItems: false,
    eligibleItems: [
      {
        id: 40,
        item_sequence: 1,
        waste_id: 20,
        waste_name_snapshot: 'Aceite usado',
        estimated_quantity: '10.00',
        item_status: { id: 2, code: 'ACCEPTED', name: 'Aceptado' },
      } as never,
    ],
    sourceBranchId: 3,
    itemsError: null,
    ...overrides,
  }
}

const defaultProps = {
  drivers,
  assistants: drivers,
  vehicles,
  branches,
  isSubmitting: false,
  submitError: null,
}

describe('ScheduleAssignmentDialog', () => {
  test('does not render dialog content when closed', () => {
    render(<ScheduleAssignmentDialog open={false} pendingDrop={null} {...defaultProps} onConfirm={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.queryByText('Programar Servicio')).not.toBeInTheDocument()
  })

  test('shows the dropped request summary, the auto-selected items, and keeps Confirmar disabled until driver/vehicle/destination are chosen', async () => {
    render(
      <ScheduleAssignmentDialog open pendingDrop={makePendingDrop()} {...defaultProps} onConfirm={vi.fn()} onCancel={vi.fn()} />
    )

    expect(await screen.findByText('Programar Servicio')).toBeInTheDocument()
    expect(screen.getByText(/SOL-2026-0142/)).toBeInTheDocument()
    expect(screen.getByText(/Textiles del Caribe/)).toBeInTheDocument()
    expect(screen.getByText(/Aceite usado/)).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
  })

  test('shows the items error and blocks confirmation when the dropped request has no eligible items', async () => {
    render(
      <ScheduleAssignmentDialog
        open
        pendingDrop={makePendingDrop({
          eligibleItems: [],
          itemsError: 'Esta solicitud no tiene ítems Aceptados pendientes de programar para su organización.',
        })}
        {...defaultProps}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(await screen.findByText(/no tiene ítems Aceptados pendientes de programar/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
  })

  test('shows a loading state while the eligible items are being resolved', () => {
    render(
      <ScheduleAssignmentDialog
        open
        pendingDrop={makePendingDrop({ isLoadingItems: true, eligibleItems: [] })}
        {...defaultProps}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('status')).toHaveTextContent('Cargando ítems de la solicitud…')
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
  })

  test('confirms with the selected driver/vehicle/destination, assistant is optional', async () => {
    const onConfirm = vi.fn()
    render(
      <ScheduleAssignmentDialog open pendingDrop={makePendingDrop()} {...defaultProps} onConfirm={onConfirm} onCancel={vi.fn()} />
    )
    await screen.findByText('Programar Servicio')

    selectOption('Conductor', /Ana Gómez/)
    selectOption('Vehículo', 'XYZ789')
    selectOption('Sede de Destino', 'Planta de Tratamiento')

    const confirmButton = screen.getByRole('button', { name: 'Confirmar' })
    expect(confirmButton).toBeEnabled()

    await act(async () => {
      fireEvent.click(confirmButton)
    })

    expect(onConfirm).toHaveBeenCalledWith({ driverId: 2, assistantId: null, vehicleId: 2, destinationBranchId: 4 })
  })

  test('includes the chosen assistant id when one is selected', async () => {
    const onConfirm = vi.fn()
    render(
      <ScheduleAssignmentDialog open pendingDrop={makePendingDrop()} {...defaultProps} onConfirm={onConfirm} onCancel={vi.fn()} />
    )
    await screen.findByText('Programar Servicio')

    selectOption('Conductor', /Ana Gómez/)
    selectOption('Auxiliar', /Carlos Pérez/)
    selectOption('Vehículo', 'XYZ789')
    selectOption('Sede de Destino', 'Planta de Tratamiento')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    })

    expect(onConfirm).toHaveBeenCalledWith({ driverId: 2, assistantId: 1, vehicleId: 2, destinationBranchId: 4 })
  })

  test('Cancelar calls onCancel without calling onConfirm', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ScheduleAssignmentDialog open pendingDrop={makePendingDrop()} {...defaultProps} onConfirm={onConfirm} onCancel={onCancel} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  test('shows a readable submit error and disables Confirmar while submitting', () => {
    render(
      <ScheduleAssignmentDialog
        open
        pendingDrop={makePendingDrop()}
        {...defaultProps}
        isSubmitting
        submitError="Vehículo no disponible."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('Vehículo no disponible.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Creando…' })).toBeDisabled()
  })
})
