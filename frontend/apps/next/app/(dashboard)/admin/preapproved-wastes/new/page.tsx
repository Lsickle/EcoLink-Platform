import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { CreatePreapprovedWasteForm } from '@/features/admin/waste/CreatePreapprovedWasteForm'

export const metadata: Metadata = { title: 'Crear Residuo Preaprobado' }

export default function AdminNewPreapprovedWastePage() {
  return (
    <>
      <SetPageTitle title="Crear Residuo Preaprobado" />
      <CreatePreapprovedWasteForm />
    </>
  )
}
