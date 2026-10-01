import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { ManifestLoadsListScreen } from '@/features/admin/manifest-loads/ManifestLoadsListScreen'

export const metadata: Metadata = { title: 'Manifiestos de Cargue' }

export default function AdminManifestLoadsPage() {
  return (
    <>
      <SetPageTitle title="Manifiestos de Cargue" />
      <ManifestLoadsListScreen />
    </>
  )
}
