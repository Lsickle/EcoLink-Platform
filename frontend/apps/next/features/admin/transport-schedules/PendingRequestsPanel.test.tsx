import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { PendingRequestsPanel } from './PendingRequestsPanel'
import type { AdminServiceRequest } from 'app/features/admin/api'

function request(overrides: Partial<AdminServiceRequest>): AdminServiceRequest {
  return {
    id: 1,
    uuid: 'uuid-1',
    organization_id: 10,
    request_code: 'SOL-1',
    requested_at: '2026-09-24T09:15:00-05:00',
    organization: { id: 10, legal_name: 'Org' },
    branch: { id: 3, name: 'Bodega Central' },
    ...overrides,
  } as AdminServiceRequest
}

describe('PendingRequestsPanel', () => {
  test('shows an empty state when there are no pending requests', () => {
    render(<PendingRequestsPanel requests={[]} />)

    expect(screen.getByText('No hay solicitudes pendientes de programar.')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  test('renders one card per request, in the order received, with the drag payload', () => {
    const requests = [
      request({ id: 1, request_code: 'SOL-0001', organization: { id: 10, legal_name: 'Org Uno' }, branch: { id: 3, name: 'Bodega Central' } }),
      request({ id: 2, request_code: 'SOL-0002', organization: { id: 11, legal_name: 'Org Dos' }, branch: { id: 4, name: 'Planta Norte' } }),
    ]

    render(<PendingRequestsPanel requests={requests} />)

    expect(screen.getByText('2')).toBeInTheDocument()
    const cards = document.querySelectorAll('.pending-request-card')
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveAttribute('data-request-id', '1')
    expect(cards[1]).toHaveAttribute('data-request-id', '2')
    expect(JSON.parse(cards[0].getAttribute('data-event') ?? '{}')).toMatchObject({
      requestId: 1,
      title: 'SOL-0001 · Org Uno',
    })
    expect(screen.getByText('SOL-0001')).toBeInTheDocument()
    expect(screen.getByText('SOL-0002')).toBeInTheDocument()
    expect(screen.getByText('Org Uno')).toBeInTheDocument()
    expect(screen.getByText('Bodega Central')).toBeInTheDocument()
    expect(screen.getByText('Planta Norte')).toBeInTheDocument()
  })
})
