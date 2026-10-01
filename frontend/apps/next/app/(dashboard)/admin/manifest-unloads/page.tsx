import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { ManifestUnloadsListScreen } from '@/features/admin/manifest-unloads/ManifestUnloadsListScreen'

export const metadata: Metadata = { title: 'Manifiestos de Descargue' }

export default function AdminManifestUnloadsPage() {
  return (
    <>
      <SetPageTitle title="Manifiestos de Descargue" />
      <ManifestUnloadsListScreen />
    </>
  )
}
