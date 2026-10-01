import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { GestorCarrierAuthorizationsListScreen } from '@/features/admin/GestorCarrierAuthorizationsListScreen'

export const metadata: Metadata = { title: 'Autorizaciones de Transportador' }

export default function AdminGestorCarrierAuthorizationsPage() {
  return (
    <>
      <SetPageTitle title="Autorizaciones de Transportador" />
      <GestorCarrierAuthorizationsListScreen />
    </>
  )
}
