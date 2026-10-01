import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { GeneratorGestorRelationshipsListScreen } from '@/features/admin/GeneratorGestorRelationshipsListScreen'

export const metadata: Metadata = { title: 'Generadores por Gestor' }

export default function AdminGeneratorGestorRelationshipsPage() {
  return (
    <>
      <SetPageTitle title="Generadores por Gestor" />
      <GeneratorGestorRelationshipsListScreen />
    </>
  )
}
