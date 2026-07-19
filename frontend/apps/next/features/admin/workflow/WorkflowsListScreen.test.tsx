import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WorkflowsListScreen } from './WorkflowsListScreen'

const fetchWorkflowsMock = vi.fn()
const cloneWorkflowMock = vi.fn()
const searchOrganizationsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchWorkflows: (...args: unknown[]) => fetchWorkflowsMock(...args),
    cloneWorkflow: (...args: unknown[]) => cloneWorkflowMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
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
    current_version: { id: 1, uuid: 'v-1', workflow_id: 1, version_number: 1, status: 'PUBLISHED', published_at: '2026-01-01T00:00:00Z', published_by: null, created_by: null, created_at: '2026-01-01T00:00:00Z' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('WorkflowsListScreen', () => {
  beforeEach(() => {
    useRequireAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: false }, isLoading: false, isAuthorized: true })
    useAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: false } })
    fetchWorkflowsMock.mockResolvedValue({
      data: [makeWorkflow()],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 15,
    })
    searchOrganizationsMock.mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 10 })
  })

  afterEach(() => {
    fetchWorkflowsMock.mockReset()
    cloneWorkflowMock.mockReset()
    searchOrganizationsMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockReset()
    useAuthMock.mockReset()
  })

  test('requires the workflows.manage permission via useRequireAuth', async () => {
    render(<WorkflowsListScreen />)
    await screen.findByText('RESPEL (Evaluación de Tratamiento)')

    expect(useRequireAuthMock).toHaveBeenCalledWith('workflows.manage')
  })

  test('for a non-platform-staff actor, hides the organization filter and fetches without organization_id', async () => {
    render(<WorkflowsListScreen />)
    await screen.findByText('RESPEL (Evaluación de Tratamiento)')

    expect(screen.queryByLabelText('Organización')).not.toBeInTheDocument()
    expect(fetchWorkflowsMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: undefined }))
  })

  test('for a platform-staff actor, shows the optional organization filter', async () => {
    useRequireAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: true }, isLoading: false, isAuthorized: true })
    useAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: true } })
    render(<WorkflowsListScreen />)
    await screen.findByText('RESPEL (Evaluación de Tratamiento)')

    expect(screen.getByLabelText('Organización')).toBeInTheDocument()
  })

  test('shows "BASE (Sistema)" for the base workflow', async () => {
    render(<WorkflowsListScreen />)
    await screen.findByText('RESPEL (Evaluación de Tratamiento)')

    expect(screen.getByText('BASE (Sistema)')).toBeInTheDocument()
  })

  test('offers "Personalizar mi Workflow" to a non-platform-staff actor without their own workflow yet', async () => {
    useRequireAuthMock.mockReturnValue({
      user: { id: 1, is_platform_staff: false, tenant_organization_id: 7 },
      isLoading: false,
      isAuthorized: true,
    })
    useAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: false, tenant_organization_id: 7 } })
    render(<WorkflowsListScreen />)
    await screen.findByText('RESPEL (Evaluación de Tratamiento)')

    expect(screen.getByRole('button', { name: /personalizar mi workflow/i })).toBeInTheDocument()
  })

  test('hides "Personalizar mi Workflow" once the actor already has their own workflow', async () => {
    useRequireAuthMock.mockReturnValue({
      user: { id: 1, is_platform_staff: false, tenant_organization_id: 7 },
      isLoading: false,
      isAuthorized: true,
    })
    useAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: false, tenant_organization_id: 7 } })
    fetchWorkflowsMock.mockResolvedValue({
      data: [makeWorkflow(), makeWorkflow({ id: 2, uuid: 'wf-2', tenant_organization_id: 7, name: 'RESPEL (personalizado)' })],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 15,
    })
    render(<WorkflowsListScreen />)
    await screen.findByText('RESPEL (personalizado)')

    expect(screen.queryByRole('button', { name: /personalizar mi workflow/i })).not.toBeInTheDocument()
  })

  test('shows the real organization legal_name for a customized workflow (gap de contrato cerrado -- index() ahora eager-carga tenantOrganization)', async () => {
    fetchWorkflowsMock.mockResolvedValue({
      data: [
        makeWorkflow({
          id: 2,
          uuid: 'wf-2',
          tenant_organization_id: 7,
          name: 'RESPEL (personalizado)',
          tenant_organization: { id: 7, legal_name: 'Gestor Ambiental S.A.S.' },
        }),
      ],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 15,
    })
    render(<WorkflowsListScreen />)
    await screen.findByText('RESPEL (personalizado)')

    expect(screen.getByText('Gestor Ambiental S.A.S.')).toBeInTheDocument()
    expect(screen.queryByText('Organización #7')).not.toBeInTheDocument()
  })

  test('falls back to "Organización #<id>" when tenant_organization is not embedded', async () => {
    fetchWorkflowsMock.mockResolvedValue({
      data: [
        makeWorkflow({
          id: 2,
          uuid: 'wf-2',
          tenant_organization_id: 7,
          name: 'RESPEL (personalizado)',
        }),
      ],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 15,
    })
    render(<WorkflowsListScreen />)
    await screen.findByText('RESPEL (personalizado)')

    expect(screen.getByText('Organización #7')).toBeInTheDocument()
  })

  test('clicking "Personalizar mi Workflow" clones the base and navigates to the new workflow', async () => {
    useRequireAuthMock.mockReturnValue({
      user: { id: 1, is_platform_staff: false, tenant_organization_id: 7 },
      isLoading: false,
      isAuthorized: true,
    })
    useAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: false, tenant_organization_id: 7 } })
    cloneWorkflowMock.mockResolvedValueOnce({ workflow: makeWorkflow({ id: 9, tenant_organization_id: 7, versions: [] }) })
    render(<WorkflowsListScreen />)
    await screen.findByText('RESPEL (Evaluación de Tratamiento)')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /personalizar mi workflow/i }))
    })

    expect(cloneWorkflowMock).toHaveBeenCalledWith(1)
    expect(pushMock).toHaveBeenCalledWith('/admin/workflows/9')
  })

  test('navigates to the detail page when clicking a workflow row', async () => {
    render(<WorkflowsListScreen />)
    await screen.findByText('RESPEL (Evaluación de Tratamiento)')

    fireEvent.click(screen.getByText('RESPEL (Evaluación de Tratamiento)'))

    expect(pushMock).toHaveBeenCalledWith('/admin/workflows/1')
  })
})
