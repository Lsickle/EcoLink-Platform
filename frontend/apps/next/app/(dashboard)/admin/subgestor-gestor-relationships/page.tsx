import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { SubgestorGestorRelationshipsListScreen } from '@/features/admin/SubgestorGestorRelationshipsListScreen'

export const metadata: Metadata = { title: 'Gestores Vinculados' }

export default function AdminSubgestorGestorRelationshipsPage() {
  return (
    <>
      <SetPageTitle title="Gestores Vinculados" />
      <SubgestorGestorRelationshipsListScreen />
    </>
  )
}
