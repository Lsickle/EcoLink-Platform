import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { GeneratorBulkImportScreen } from '@/features/admin/GeneratorBulkImportScreen'

export const metadata: Metadata = { title: 'Carga Masiva de Generadores' }

export default function AdminGeneratorBulkImportPage() {
  return (
    <>
      <SetPageTitle title="Carga Masiva de Generadores" />
      <GeneratorBulkImportScreen />
    </>
  )
}
