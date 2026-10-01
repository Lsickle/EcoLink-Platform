import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { UnloadRequestsListScreen } from '@/features/admin/unload-requests/UnloadRequestsListScreen'

export const metadata: Metadata = { title: 'Solicitudes de Descargue' }

export default function AdminUnloadRequestsPage() {
  return (
    <>
      <SetPageTitle title="Solicitudes de Descargue" />
      <UnloadRequestsListScreen />
    </>
  )
}
