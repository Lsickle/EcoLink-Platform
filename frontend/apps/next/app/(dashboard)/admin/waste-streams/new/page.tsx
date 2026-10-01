import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { CreateWasteStreamForm } from '@/features/admin/CreateWasteStreamForm'

export const metadata: Metadata = { title: 'Crear Corriente Y/A' }

export default function AdminNewWasteStreamPage() {
  return (
    <>
      <SetPageTitle title="Crear Corriente Y/A" />
      <CreateWasteStreamForm />
    </>
  )
}
