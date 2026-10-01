import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { CreateUnCodeForm } from '@/features/admin/CreateUnCodeForm'

export const metadata: Metadata = { title: 'Crear Código UN' }

export default function AdminNewUnCodePage() {
  return (
    <>
      <SetPageTitle title="Crear Código UN" />
      <CreateUnCodeForm />
    </>
  )
}
