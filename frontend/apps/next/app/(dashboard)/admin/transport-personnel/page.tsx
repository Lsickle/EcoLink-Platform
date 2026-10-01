import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { TransportPersonnelListScreen } from '@/features/admin/transport-personnel/TransportPersonnelListScreen'

export const metadata: Metadata = { title: 'Conductores' }

export default function AdminTransportPersonnelPage() {
  return (
    <>
      <SetPageTitle title="Conductores" />
      <TransportPersonnelListScreen />
    </>
  )
}
