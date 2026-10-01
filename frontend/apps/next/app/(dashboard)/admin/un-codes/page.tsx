import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { UnCodesListScreen } from '@/features/admin/UnCodesListScreen'

export const metadata: Metadata = { title: 'Códigos UN' }

export default function AdminUnCodesPage() {
  return (
    <>
      <SetPageTitle title="Códigos UN" />
      <UnCodesListScreen />
    </>
  )
}
