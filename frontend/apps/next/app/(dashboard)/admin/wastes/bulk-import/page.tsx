import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { WasteBulkImportScreen } from '@/features/admin/WasteBulkImportScreen'

export const metadata: Metadata = { title: 'Carga Masiva de Residuos' }

export default function AdminWasteBulkImportPage() {
  return (
    <>
      <SetPageTitle title="Carga Masiva de Residuos" />
      <WasteBulkImportScreen />
    </>
  )
}
