import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { WasteWizard } from '@/features/admin/waste/WasteWizard'

export const metadata: Metadata = { title: 'Declarar Residuo' }

export default function AdminNewWastePage() {
  return (
    <>
      <SetPageTitle title="Declarar Residuo" />
      <WasteWizard />
    </>
  )
}
