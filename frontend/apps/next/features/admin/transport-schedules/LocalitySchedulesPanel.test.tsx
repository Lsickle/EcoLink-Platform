import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import type { AdminTransportSchedule } from 'app/features/admin/api'
import { LocalitySchedulesPanel } from './LocalitySchedulesPanel'

function schedule(overrides: Partial<AdminTransportSchedule> = {}): AdminTransportSchedule {
  return {
    id: 1,
    uuid: 'uuid-1',
    tenant_organization_id: 1,
    organization_id: 1,
    waste_service_request_id: 1,
    schedule_number: 'PROG-0001',
    source_branch_id: 1,
    destination_branch_id: 2,
    vehicle_id: 1,
    transport_personnel_id: 1,
    responsible_user_id: null,
    scheduled_pickup_at: '2026-09-30T14:00:00-05:00',
    pickup_window_start: null,
    pickup_window_end: null,
    priority: 'NORMAL',
    estimated_weight_kg: null,
    estimated_volume_m3: null,
    planned_distance_km: null,
    planned_duration_minutes: null,
    requires_special_handling: false,
    observations: null,
    version_number: 1,
    parent_schedule_id: null,
    is_active: true,
    metadata: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    organization: { id: 1, legal_name: 'Org Uno' },
    waste_service_request: { id: 1, request_code: 'SOL-0001' },
    transport_status: {
      id: 1,
      code: 'PROG',
      name: 'Programada',
      description: null,
      sort_order: 1,
      is_initial: false,
      is_final: false,
      requires_schedule: false,
      requires_vehicle: false,
      requires_load_manifest: false,
      requires_unload_manifest: false,
      color_hex: null,
      icon: null,
      is_active: true,
    },
    vehicle: { id: 1, plate_number: 'ABC123' },
    source_branch: { id: 1, name: 'Sede Norte' },
    destination_branch: { id: 2, name: 'Planta Gestor' },
    ...overrides,
  }
}

describe('LocalitySchedulesPanel', () => {
  test('shows a loading state with EcoLinkSpinner (never a plain "Cargando…" paragraph)', () => {
    render(
      <LocalitySchedulesPanel
        schedules={[]}
        isLoading
        selectedLocalityName="Chapinero"
        onSelectSchedule={vi.fn()}
      />
    )

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  test('shows the "select a locality" empty state when no locality is selected yet', () => {
    render(
      <LocalitySchedulesPanel
        schedules={[]}
        isLoading={false}
        selectedLocalityName={null}
        onSelectSchedule={vi.fn()}
      />
    )

    expect(screen.getByText(/seleccione una localidad en el mapa/i)).toBeInTheDocument()
    expect(screen.queryByText(/sin programaciones para esta fecha/i)).not.toBeInTheDocument()
  })

  test('shows a distinct "no schedules" empty state when a locality is selected but has none', () => {
    render(
      <LocalitySchedulesPanel
        schedules={[]}
        isLoading={false}
        selectedLocalityName="Chapinero"
        onSelectSchedule={vi.fn()}
      />
    )

    expect(screen.getByText(/sin programaciones para esta fecha y localidad/i)).toBeInTheDocument()
    expect(screen.queryByText(/seleccione una localidad en el mapa/i)).not.toBeInTheDocument()
  })

  test('renders a read-only list with no drag-and-drop affordances (no .pending-request-card, no data-event, no grab cursor)', () => {
    render(
      <LocalitySchedulesPanel
        schedules={[schedule()]}
        isLoading={false}
        selectedLocalityName="Chapinero"
        onSelectSchedule={vi.fn()}
      />
    )

    expect(screen.getByText('PROG-0001')).toBeInTheDocument()
    expect(document.querySelectorAll('.pending-request-card')).toHaveLength(0)
    expect(document.querySelector('[data-event]')).toBeNull()
    expect(document.querySelector('.cursor-grab')).toBeNull()
  })

  test('calls onSelectSchedule with the schedule id when a row is clicked', () => {
    const onSelectSchedule = vi.fn()
    render(
      <LocalitySchedulesPanel
        schedules={[schedule({ id: 42, schedule_number: 'PROG-0042' })]}
        isLoading={false}
        selectedLocalityName="Chapinero"
        onSelectSchedule={onSelectSchedule}
      />
    )

    fireEvent.click(screen.getByText('PROG-0042'))

    expect(onSelectSchedule).toHaveBeenCalledWith(42)
  })
})
