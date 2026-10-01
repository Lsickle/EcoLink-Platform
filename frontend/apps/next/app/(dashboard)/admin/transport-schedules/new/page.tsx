import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { CreateTransportScheduleForm } from '@/features/admin/transport-schedules/CreateTransportScheduleForm'

export const metadata: Metadata = { title: 'Nueva Programación de Recolección' }

export default function AdminNewTransportSchedulePage() {
  return (
    <>
      <SetPageTitle title="Nueva Programación de Recolección" />
      <CreateTransportScheduleForm />
    </>
  )
}
