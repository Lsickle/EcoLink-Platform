import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { PackagingConditionsListScreen } from '@/features/admin/catalogs/PackagingConditionsListScreen'

export const metadata: Metadata = { title: 'Estados del Embalaje' }

export default function AdminPackagingConditionsPage() {
  return (
    <>
      <SetPageTitle title="Estados del Embalaje" />
      <PackagingConditionsListScreen />
    </>
  )
}
