import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { CreateWorkflowTransitionForm } from './CreateWorkflowTransitionForm'

const storeWorkflowTransitionMock = vi.fn()
const updateWorkflowTransitionMock = vi.fn()
const fetchRolesMock = vi.fn()
const fetchBusinessRolesMock = vi.fn()
const fetchRespelStatusesMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    storeWorkflowTransition: (...args: unknown[]) => storeWorkflowTransitionMock(...args),
    updateWorkflowTransition: (...args: unknown[]) => updateWorkflowTransitionMock(...args),
    fetchRoles: (...args: unknown[]) => fetchRolesMock(...args),
    fetchBusinessRoles: (...args: unknown[]) => fetchBusinessRolesMock(...args),
    fetchRespelStatuses: (...args: unknown[]) => fetchRespelStatusesMock(...args),
  }
})

describe('CreateWorkflowTransitionForm', () => {
  beforeEach(() => {
    fetchRolesMock.mockResolvedValue({
      data: [{ id: 3, uuid: 'r-3', code: 'ADMINISTRADOR', name: 'Administrador', description: null, is_system: true, is_editable: false, priority_level: 1, is_active: true, tenant_organization_id: null, created_at: '', updated_at: '', users_count: 0, permissions_count: 0, risk_level: 'LOW' }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 100,
    })
    fetchBusinessRolesMock.mockResolvedValue({ data: [] })
    fetchRespelStatusesMock.mockResolvedValue({
      data: [
        { id: 1, code: 'TECH_PENDING', name: 'Pendiente Técnico', description: null, sort_order: 1, is_initial: true, is_final: false, is_approved_status: false, is_rejected_status: false, color_hex: null, icon: null, is_active: true },
        { id: 2, code: 'TECH_UNDER_REVIEW', name: 'En Revisión Técnica', description: null, sort_order: 2, is_initial: false, is_final: false, is_approved_status: false, is_rejected_status: false, color_hex: null, icon: null, is_active: true },
      ],
    })
  })

  afterEach(() => {
    storeWorkflowTransitionMock.mockReset()
    updateWorkflowTransitionMock.mockReset()
    fetchRolesMock.mockReset()
    fetchBusinessRolesMock.mockReset()
    fetchRespelStatusesMock.mockReset()
  })

  test('create mode: loads the respel_statuses catalog into real Selects and submitting POSTs the payload', async () => {
    storeWorkflowTransitionMock.mockResolvedValueOnce({
      workflow_transition: { id: 10, uuid: 't-10', workflow_version_id: 2, from_status_code: 'TECH_PENDING', to_status_code: 'TECH_UNDER_REVIEW', is_automatic: false, requires_approval: false, roles: [] },
    })
    const onSaved = vi.fn()

    render(
      <CreateWorkflowTransitionForm
        workflowId={1}
        mode="create"
        open={true}
        onOpenChange={vi.fn()}
        onSaved={onSaved}
      />
    )
    await screen.findByLabelText('Desde (estado origen)')

    fireEvent.click(screen.getByRole('combobox', { name: /desde \(estado origen\)/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Pendiente Técnico' }))
    fireEvent.click(screen.getByRole('combobox', { name: /hasta \(estado destino\)/i }))
    // Un solo `fireEvent.click` no basta para el segundo `<Select>` abierto en
    // la misma sesión de test (limitación conocida de Base UI Select +
    // jsdom con dos selects reales interactuados en secuencia rápida) --
    // se dispara la secuencia completa de puntero para que el picker
    // registre la selección real, no solo el resaltado.
    const toOption = await screen.findByRole('option', { name: 'En Revisión Técnica' })
    fireEvent.pointerDown(toOption)
    fireEvent.mouseDown(toOption)
    fireEvent.pointerUp(toOption)
    fireEvent.mouseUp(toOption)
    fireEvent.click(toOption)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    })

    expect(fetchRespelStatusesMock).toHaveBeenCalledWith({ activeOnly: true })
    expect(storeWorkflowTransitionMock).toHaveBeenCalledWith(1, {
      from_status_code: 'TECH_PENDING',
      to_status_code: 'TECH_UNDER_REVIEW',
      is_automatic: false,
      requires_approval: false,
      roles: [],
    })
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10, from_status_code: 'TECH_PENDING', to_status_code: 'TECH_UNDER_REVIEW' })
    )
  })

  test('edit mode: from/to inputs are disabled, only requires_approval/roles travel in the PUT', async () => {
    updateWorkflowTransitionMock.mockResolvedValueOnce({
      workflow_transition: { id: 10, uuid: 't-10', workflow_version_id: 2, from_status_code: 'TECH_PENDING', to_status_code: 'TECH_UNDER_REVIEW', is_automatic: false, requires_approval: true, roles: [] },
    })
    const onSaved = vi.fn()

    render(
      <CreateWorkflowTransitionForm
        workflowId={1}
        mode="edit"
        transition={{
          id: 10,
          uuid: 't-10',
          workflow_version_id: 2,
          from_status_code: 'TECH_PENDING',
          to_status_code: 'TECH_UNDER_REVIEW',
          is_automatic: false,
          requires_approval: false,
          roles: [],
        }}
        open={true}
        onOpenChange={vi.fn()}
        onSaved={onSaved}
      />
    )

    expect(screen.getByLabelText('Desde (estado origen)')).toBeDisabled()
    expect(screen.getByLabelText('Hasta (estado destino)')).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Requiere aprobación' }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    })

    expect(updateWorkflowTransitionMock).toHaveBeenCalledWith(1, 10, {
      is_automatic: false,
      requires_approval: true,
      roles: [],
    })
    expect(onSaved).toHaveBeenCalled()
  })

  test('passes organizationId through to fetchRoles so a platform staff editing a foreign org workflow gets that org\'s roles', async () => {
    render(
      <CreateWorkflowTransitionForm
        workflowId={1}
        organizationId={7}
        mode="create"
        open={true}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />
    )
    await screen.findByLabelText('Desde (estado origen)')

    expect(fetchRolesMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 7 }))
  })
})
