import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WorkflowDetailScreen } from './WorkflowDetailScreen'

const fetchWorkflowMock = vi.fn()
const storeWorkflowVersionMock = vi.fn()
const publishWorkflowVersionMock = vi.fn()
const destroyWorkflowTransitionMock = vi.fn()
const cloneWorkflowMock = vi.fn()
const fetchRolesMock = vi.fn()
const fetchBusinessRolesMock = vi.fn()
const fetchRespelStatusesMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchWorkflow: (...args: unknown[]) => fetchWorkflowMock(...args),
    storeWorkflowVersion: (...args: unknown[]) => storeWorkflowVersionMock(...args),
    publishWorkflowVersion: (...args: unknown[]) => publishWorkflowVersionMock(...args),
    destroyWorkflowTransition: (...args: unknown[]) => destroyWorkflowTransitionMock(...args),
    cloneWorkflow: (...args: unknown[]) => cloneWorkflowMock(...args),
    fetchRoles: (...args: unknown[]) => fetchRolesMock(...args),
    fetchBusinessRoles: (...args: unknown[]) => fetchBusinessRolesMock(...args),
    fetchRespelStatuses: (...args: unknown[]) => fetchRespelStatusesMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

type MockUser = { id: number; is_platform_staff?: boolean; tenant_organization_id?: number | null } | null

const useRequireAuthMock = vi.fn<
  (permission?: string) => { user: MockUser; isLoading: boolean; isAuthorized: boolean }
>()
const useAuthMock = vi.fn<() => { user: MockUser }>()

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
  useAuth: () => useAuthMock(),
}))

function makeRespelStatus(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    code: 'TECH_PENDING',
    name: 'Pendiente Técnico',
    description: null,
    sort_order: 1,
    is_initial: false,
    is_final: false,
    is_approved_status: false,
    is_rejected_status: false,
    color_hex: null,
    icon: null,
    is_active: true,
    ...overrides,
  }
}

function makePublishedTransition(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 't-1',
    workflow_version_id: 1,
    from_status_code: 'TECH_PENDING',
    to_status_code: 'TECH_APPROVED',
    from_status: makeRespelStatus({ id: 1, code: 'TECH_PENDING', name: 'Pendiente Técnico', sort_order: 1, is_initial: true }),
    to_status: makeRespelStatus({ id: 2, code: 'TECH_APPROVED', name: 'Aprobado Técnico', sort_order: 2, is_final: true }),
    is_automatic: false,
    requires_approval: true,
    roles: [{ id: 1, role_id: 3, business_role_id: null, role: { id: 3, code: 'ADMINISTRADOR', name: 'Administrador' }, business_role: null }],
    rules: [],
    ...overrides,
  }
}

function makeWorkflow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'wf-1',
    tenant_organization_id: null,
    code: 'RESPEL',
    name: 'RESPEL (Evaluación de Tratamiento)',
    description: null,
    entity_type: 'TREATMENT',
    is_system: true,
    is_active: true,
    current_version_id: 1,
    current_version: {
      id: 1,
      uuid: 'v-1',
      workflow_id: 1,
      version_number: 1,
      status: 'PUBLISHED',
      published_at: '2026-01-01T00:00:00Z',
      published_by: null,
      created_by: null,
      created_at: '2026-01-01T00:00:00Z',
      transitions: [makePublishedTransition()],
    },
    versions: [
      {
        id: 1,
        uuid: 'v-1',
        workflow_id: 1,
        version_number: 1,
        status: 'PUBLISHED',
        published_at: '2026-01-01T00:00:00Z',
        published_by: null,
        created_by: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('WorkflowDetailScreen', () => {
  beforeEach(() => {
    sessionStorage.clear()
    useRequireAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: true }, isLoading: false, isAuthorized: true })
    useAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: true } })
    fetchWorkflowMock.mockResolvedValue({ workflow: makeWorkflow() })
    fetchRolesMock.mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 100 })
    fetchBusinessRolesMock.mockResolvedValue({ data: [] })
    fetchRespelStatusesMock.mockResolvedValue({ data: [] })
  })

  afterEach(() => {
    fetchWorkflowMock.mockReset()
    storeWorkflowVersionMock.mockReset()
    publishWorkflowVersionMock.mockReset()
    destroyWorkflowTransitionMock.mockReset()
    cloneWorkflowMock.mockReset()
    fetchRolesMock.mockReset()
    fetchBusinessRolesMock.mockReset()
    fetchRespelStatusesMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockReset()
    useAuthMock.mockReset()
    sessionStorage.clear()
  })

  test('requires the workflows.manage permission via useRequireAuth', async () => {
    render(<WorkflowDetailScreen workflowId={1} />)
    await screen.findByText('RESPEL (Evaluación de Tratamiento)')

    expect(useRequireAuthMock).toHaveBeenCalledWith('workflows.manage')
  })

  test('renders KPIs and the transitions table using the real respel_statuses names embedded in the transition', async () => {
    render(<WorkflowDetailScreen workflowId={1} />)
    await screen.findByText('RESPEL (Evaluación de Tratamiento)')

    expect(screen.getByText(/Pendiente Técnico.*Aprobado Técnico/)).toBeInTheDocument()
    expect(screen.getByText('Administrador')).toBeInTheDocument()
    // Total Transiciones KPI
    const kpi = screen.getByText('Total Transiciones').closest('div') as HTMLElement
    expect(within(kpi).getByText('1')).toBeInTheDocument()
  })

  test('orders the "→ Flujo" block per axis by the real sort_order/is_initial/is_final of the embedded respel_statuses', async () => {
    render(<WorkflowDetailScreen workflowId={1} />)
    await screen.findByText('RESPEL (Evaluación de Tratamiento)')

    const flowSection = screen.getByText('→ Flujo').closest('div') as HTMLElement
    const items = within(flowSection).getAllByRole('listitem')
    const texts = items.map((item) => item.textContent)
    // Pendiente Técnico (sort_order 1, is_initial) antes de Aprobado Técnico (sort_order 2, is_final).
    expect(texts.findIndex((text) => text?.includes('Pendiente Técnico'))).toBeLessThan(
      texts.findIndex((text) => text?.includes('Aprobado Técnico'))
    )
    expect(within(flowSection).getByText('Inicial')).toBeInTheDocument()
    expect(within(flowSection).getByText('Final')).toBeInTheDocument()
  })

  test('platform staff sees version/transition management actions', async () => {
    render(<WorkflowDetailScreen workflowId={1} />)
    await screen.findByText('RESPEL (Evaluación de Tratamiento)')

    expect(screen.getByRole('button', { name: 'Nueva Versión' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publicar Versión' })).toBeInTheDocument()
  })

  test('a non-platform-staff actor viewing the BASE sees "Personalizar mi Workflow" instead of edit actions', async () => {
    useRequireAuthMock.mockReturnValue({
      user: { id: 1, is_platform_staff: false, tenant_organization_id: 7 },
      isLoading: false,
      isAuthorized: true,
    })
    useAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: false, tenant_organization_id: 7 } })
    render(<WorkflowDetailScreen workflowId={1} />)
    await screen.findByText('RESPEL (Evaluación de Tratamiento)')

    expect(screen.getByRole('button', { name: /personalizar mi workflow/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nueva Versión' })).not.toBeInTheDocument()
  })

  test('clicking "Nueva Versión" creates a DRAFT and switches to viewing it', async () => {
    storeWorkflowVersionMock.mockResolvedValueOnce({
      workflow_version: {
        id: 2,
        uuid: 'v-2',
        workflow_id: 1,
        version_number: 2,
        status: 'DRAFT',
        published_at: null,
        published_by: null,
        created_by: null,
        created_at: '2026-01-02T00:00:00Z',
        transitions: [makePublishedTransition({ id: 5, uuid: 't-5' })],
      },
    })
    render(<WorkflowDetailScreen workflowId={1} />)
    await screen.findByText('RESPEL (Evaluación de Tratamiento)')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Nueva Versión' }))
    })

    expect(storeWorkflowVersionMock).toHaveBeenCalledWith(1)
    expect(await screen.findByText(/versión en borrador/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Nueva Transición' })).not.toBeDisabled()
  })

  test('publishing refetches the workflow to get the authoritative current_version', async () => {
    const draftWorkflow = makeWorkflow({
      current_version_id: null,
      current_version: null,
      versions: [
        makeWorkflow().versions[0],
        {
          id: 2,
          uuid: 'v-2',
          workflow_id: 1,
          version_number: 2,
          status: 'DRAFT',
          published_at: null,
          published_by: null,
          created_by: null,
          created_at: '2026-01-02T00:00:00Z',
          transitions: [makePublishedTransition({ id: 5, uuid: 't-5' })],
        },
      ],
    })
    fetchWorkflowMock.mockResolvedValueOnce({ workflow: draftWorkflow })
    publishWorkflowVersionMock.mockResolvedValueOnce({ workflow: { ...draftWorkflow, current_version_id: 2 } })
    fetchWorkflowMock.mockResolvedValueOnce({
      workflow: makeWorkflow({ current_version: { ...makeWorkflow().current_version, id: 2, version_number: 2 } }),
    })

    render(<WorkflowDetailScreen workflowId={1} />)
    await screen.findByText('RESPEL (Evaluación de Tratamiento)')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publicar Versión' }))
    })

    expect(publishWorkflowVersionMock).toHaveBeenCalledWith(1, 2)
    expect(fetchWorkflowMock).toHaveBeenCalledTimes(2)
  })

  test('deletes a transition from the DRAFT version', async () => {
    const draftTransition = makePublishedTransition({
      id: 9,
      uuid: 't-9',
      from_status_code: 'COM_DRAFT',
      to_status_code: 'COM_QUOTED',
      from_status: makeRespelStatus({ id: 3, code: 'COM_DRAFT', name: 'Borrador Comercial', sort_order: 1, is_initial: true }),
      to_status: makeRespelStatus({ id: 4, code: 'COM_QUOTED', name: 'Cotizado', sort_order: 2 }),
    })
    const draftWorkflow = makeWorkflow({
      versions: [
        makeWorkflow().versions[0],
        {
          id: 2,
          uuid: 'v-2',
          workflow_id: 1,
          version_number: 2,
          status: 'DRAFT',
          published_at: null,
          published_by: null,
          created_by: null,
          created_at: '2026-01-02T00:00:00Z',
          transitions: [draftTransition],
        },
      ],
    })
    fetchWorkflowMock.mockResolvedValueOnce({ workflow: draftWorkflow })
    destroyWorkflowTransitionMock.mockResolvedValueOnce(undefined)

    render(<WorkflowDetailScreen workflowId={1} />)
    await screen.findByText('RESPEL (Evaluación de Tratamiento)')

    fireEvent.click(screen.getByRole('button', { name: 'Ver Borrador' }))
    await screen.findByText(/Borrador Comercial.*Cotizado/)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    })

    expect(destroyWorkflowTransitionMock).toHaveBeenCalledWith(1, 9)
  })

  test('a DRAFT version with no transitions yet (gap de contrato cerrado -- show() ya trae versions[].transitions completo, siempre array) shows the empty-search row, never the old "no disponible" notice', async () => {
    const workflowWithEmptyDraft = makeWorkflow({
      versions: [
        makeWorkflow().versions[0],
        {
          id: 3,
          uuid: 'v-3',
          workflow_id: 1,
          version_number: 2,
          status: 'DRAFT',
          published_at: null,
          published_by: null,
          created_by: null,
          created_at: '2026-01-02T00:00:00Z',
          transitions: [],
        },
      ],
    })
    fetchWorkflowMock.mockResolvedValueOnce({ workflow: workflowWithEmptyDraft })

    render(<WorkflowDetailScreen workflowId={1} />)
    await screen.findByText('RESPEL (Evaluación de Tratamiento)')

    fireEvent.click(screen.getByRole('button', { name: 'Ver Borrador' }))

    expect(await screen.findByText('No hay transiciones que coincidan con la búsqueda.')).toBeInTheDocument()
    expect(screen.queryByText(/no está disponible en esta pantalla/i)).not.toBeInTheDocument()
  })

  test('passes the workflow tenant_organization_id through to CreateWorkflowTransitionForm so fetchRoles scopes to that organization', async () => {
    fetchWorkflowMock.mockResolvedValueOnce({
      workflow: makeWorkflow({
        id: 2,
        tenant_organization_id: 7,
        name: 'RESPEL (personalizado)',
        tenant_organization: { id: 7, legal_name: 'Gestor Ambiental S.A.S.' },
        current_version: null,
        current_version_id: null,
        versions: [
          {
            id: 4,
            uuid: 'v-4',
            workflow_id: 2,
            version_number: 1,
            status: 'DRAFT',
            published_at: null,
            published_by: null,
            created_by: null,
            created_at: '2026-01-02T00:00:00Z',
            transitions: [],
          },
        ],
      }),
    })

    render(<WorkflowDetailScreen workflowId={2} />)
    await screen.findByText('RESPEL (personalizado)')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Nueva Transición' }))
    })

    expect(fetchRolesMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 7 }))
  })
})
