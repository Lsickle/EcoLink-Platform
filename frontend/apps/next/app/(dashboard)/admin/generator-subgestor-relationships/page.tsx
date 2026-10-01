import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { GeneratorSubgestorRelationshipsListScreen } from '@/features/admin/GeneratorSubgestorRelationshipsListScreen'

export const metadata: Metadata = { title: 'Generadores por Subgestor' }

export default function AdminGeneratorSubgestorRelationshipsPage() {
  return (
    <>
      <SetPageTitle title="Generadores por Subgestor" />
      <GeneratorSubgestorRelationshipsListScreen />
    </>
  )
}
