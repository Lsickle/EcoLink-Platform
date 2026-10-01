import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { WasteWizard } from '@/features/admin/waste/WasteWizard'

export const metadata: Metadata = { title: 'Editar Declaración de Residuo' }

export default async function AdminEditWastePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Editar Declaración de Residuo" />
      <WasteWizard wasteId={id} />
    </>
  )
}
