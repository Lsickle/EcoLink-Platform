import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { CreateTransportPersonnelForm } from '@/features/admin/transport-personnel/CreateTransportPersonnelForm'

export const metadata: Metadata = { title: 'Registrar Conductor' }

export default function AdminNewTransportPersonnelPage() {
  return (
    <>
      <SetPageTitle title="Registrar Conductor" />
      <CreateTransportPersonnelForm />
    </>
  )
}
