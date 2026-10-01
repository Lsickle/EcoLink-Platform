import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { InvitationRequestsListScreen } from '@/features/admin/InvitationRequestsListScreen'

export const metadata: Metadata = { title: 'Solicitudes de Invitación' }

export default function AdminInvitationRequestsPage() {
  return (
    <>
      <SetPageTitle title="Solicitudes de Invitación" />
      <InvitationRequestsListScreen />
    </>
  )
}
