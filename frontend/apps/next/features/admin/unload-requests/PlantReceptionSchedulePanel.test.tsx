import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError, type AdminPlantReceptionSchedule } from 'app/features/admin/api'
import { PlantReceptionSchedulePanel } from './PlantReceptionSchedulePanel'

const fetchBranchLocationsMock = vi.fn()
const proposePlantReceptionScheduleMock = vi.fn()
const counterProposePlantReceptionScheduleMock = vi.fn()
const confirmPlantReceptionScheduleMock = vi.fn()
const reschedulePlantReceptionScheduleMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchBranchLocations: (...args: unknown[]) => fetchBranchLocationsMock(...args),
    proposePlantReceptionSchedule: (...args: unknown[]) => proposePlantReceptionScheduleMock(...args),
    counterProposePlantReceptionSchedule: (...args: unknown[]) => counterProposePlantReceptionScheduleMock(...args),
    confirmPlantReceptionSchedule: (...args: unknown[]) => confirmPlantReceptionScheduleMock(...args),
    reschedulePlantReceptionSchedule: (...args: unknown[]) => reschedulePlantReceptionScheduleMock(...args),
  }
})

function baseSchedule(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 77,
    uuid: 'prs-77',
    tenant_organization_id: 1,
    unload_request_id: 12,
    receiving_branch_id: 3,
    dock_location_id: 8,
    scheduled_date: '2026-07-23',
    scheduled_start_at: '2026-07-23T07:00:00Z',
    scheduled_end_at: '2026-07-23T10:00:00Z',
    proposed_by_role: 'RECEPTION_COORDINATOR',
    proposed_by_user_id: 1,
    proposed_at: '2026-07-20T00:00:00Z',
    counter_proposed_date: null,
    counter_proposed_start_at: null,
    counter_proposed_end_at: null,
    counter_proposed_by: null,
    counter_proposed_at: null,
    confirmed_by: null,
    confirmed_at: null,
    status: 'PROPOSED',
    reschedule_reason: null,
    rejection_reason: null,
    version_number: 1,
    parent_schedule_id: null,
    is_active: true,
    dock_location: { id: 8, code: 'M3', name: 'Muelle 3' },
    proposed_by_user: { id: 1, username: 'ana.receptora' },
    ...overrides,
  } as unknown as AdminPlantReceptionSchedule
}

describe('PlantReceptionSchedulePanel', () => {
  beforeEach(() => {
    fetchBranchLocationsMock.mockResolvedValue({
      data: [{ id: 8, code: 'M3', name: 'Muelle 3', branch_id: 3, is_active: true, uuid: 'bl-8', tenant_organization_id: 1, created_at: '', updated_at: '' }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 100,
    })
  })

  afterEach(() => {
    fetchBranchLocationsMock.mockReset()
    proposePlantReceptionScheduleMock.mockReset()
    counterProposePlantReceptionScheduleMock.mockReset()
    confirmPlantReceptionScheduleMock.mockReset()
    reschedulePlantReceptionScheduleMock.mockReset()
  })

  test('shows a note instead of the panel when the request is not Approved', async () => {
    render(
      <PlantReceptionSchedulePanel
        unloadRequestId={12}
        unloadRequestStatusCode="SUBMITTED"
        receivingBranchId={3}
        schedule={null}
        canManage
        onChanged={vi.fn()}
      />
    )

    expect(screen.getByText(/solo puede proponerse sobre una solicitud Aprobada/)).toBeInTheDocument()
  })

  test('shows "+ Programar Recepción" when Approved without an active schedule, and proposes', async () => {
    const onChanged = vi.fn()
    proposePlantReceptionScheduleMock.mockResolvedValue({ plant_reception_schedule: baseSchedule() })
    render(
      <PlantReceptionSchedulePanel
        unloadRequestId={12}
        unloadRequestStatusCode="APPROVED"
        receivingBranchId={3}
        schedule={null}
        canManage
        onChanged={onChanged}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: '+ Programar Recepción' }))
    fireEvent.change(screen.getByLabelText('Fecha de Recepción'), { target: { value: '2026-07-23' } })
    fireEvent.change(screen.getByLabelText('Hora de Inicio'), { target: { value: '2026-07-23T07:00' } })
    fireEvent.change(screen.getByLabelText('Hora de Fin Estimada'), { target: { value: '2026-07-23T10:00' } })
    fireEvent.click(screen.getByRole('button', { name: '✓ Confirmar Recepción' }))

    await waitFor(() =>
      expect(proposePlantReceptionScheduleMock).toHaveBeenCalledWith(
        12,
        expect.objectContaining({ scheduled_date: '2026-07-23', scheduled_start_at: '2026-07-23T07:00', scheduled_end_at: '2026-07-23T10:00' })
      )
    )
    expect(onChanged).toHaveBeenCalled()
  })

  test('shows the original proposal and a "Contraproponer"/"Confirmar" pair when PROPOSED', async () => {
    render(
      <PlantReceptionSchedulePanel
        unloadRequestId={12}
        unloadRequestStatusCode="APPROVED"
        receivingBranchId={3}
        schedule={baseSchedule()}
        canManage
        onChanged={vi.fn()}
      />
    )

    expect(screen.getByText('Propuesta Original')).toBeInTheDocument()
    expect(screen.getByText('ana.receptora')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Contraproponer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument()
    // Sin franja CONFIRMED todavía -- "Reprogramar" no aplica.
    expect(screen.queryByRole('button', { name: 'Reprogramar' })).not.toBeInTheDocument()
  })

  test('shows both slots (original + counter-proposal) when COUNTER_PROPOSED', async () => {
    render(
      <PlantReceptionSchedulePanel
        unloadRequestId={12}
        unloadRequestStatusCode="APPROVED"
        receivingBranchId={3}
        schedule={baseSchedule({
          status: 'COUNTER_PROPOSED',
          counter_proposed_date: '2026-07-24',
          counter_proposed_start_at: '2026-07-24T09:00:00Z',
          counter_proposed_end_at: '2026-07-24T11:00:00Z',
          counter_proposed_by: 5,
        })}
        canManage
        onChanged={vi.fn()}
      />
    )

    expect(screen.getByText('Propuesta Original')).toBeInTheDocument()
    // "Contrapropuesta" aparece 2 veces (badge de estado + título del bloque).
    expect(screen.getAllByText('Contrapropuesta').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Usuario #5')).toBeInTheDocument()
  })

  test('submits a counter-proposal', async () => {
    const onChanged = vi.fn()
    counterProposePlantReceptionScheduleMock.mockResolvedValue({ plant_reception_schedule: baseSchedule({ status: 'COUNTER_PROPOSED' }) })
    render(
      <PlantReceptionSchedulePanel
        unloadRequestId={12}
        unloadRequestStatusCode="APPROVED"
        receivingBranchId={3}
        schedule={baseSchedule()}
        canManage
        onChanged={onChanged}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Contraproponer' }))
    fireEvent.change(screen.getByLabelText('Fecha de Recepción'), { target: { value: '2026-07-24' } })
    fireEvent.change(screen.getByLabelText('Hora de Inicio'), { target: { value: '2026-07-24T09:00' } })
    fireEvent.change(screen.getByLabelText('Hora de Fin Estimada'), { target: { value: '2026-07-24T11:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Contraproponer' }))

    await waitFor(() =>
      expect(counterProposePlantReceptionScheduleMock).toHaveBeenCalledWith(
        77,
        expect.objectContaining({ counter_proposed_date: '2026-07-24' })
      )
    )
    expect(onChanged).toHaveBeenCalled()
  })

  test('surfaces the backend 422 self-confirmation error clearly', async () => {
    confirmPlantReceptionScheduleMock.mockRejectedValue(
      new ApiValidationError('Error de validación.', {
        confirmed_by: ['No puede confirmar esta franja: pertenece a la misma organización que realizó la última propuesta.'],
      })
    )
    render(
      <PlantReceptionSchedulePanel
        unloadRequestId={12}
        unloadRequestStatusCode="APPROVED"
        receivingBranchId={3}
        schedule={baseSchedule()}
        canManage
        onChanged={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/No puede confirmar esta franja/)
  })

  test('shows "Reprogramar" only when CONFIRMED', async () => {
    render(
      <PlantReceptionSchedulePanel
        unloadRequestId={12}
        unloadRequestStatusCode="APPROVED"
        receivingBranchId={3}
        schedule={baseSchedule({ status: 'CONFIRMED', confirmed_by: 5, confirmed_at: '2026-07-20T12:00:00Z' })}
        canManage
        onChanged={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Reprogramar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Contraproponer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
  })

  test('hides all management actions without permission', async () => {
    render(
      <PlantReceptionSchedulePanel
        unloadRequestId={12}
        unloadRequestStatusCode="APPROVED"
        receivingBranchId={3}
        schedule={baseSchedule()}
        canManage={false}
        onChanged={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: 'Contraproponer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
  })
})
