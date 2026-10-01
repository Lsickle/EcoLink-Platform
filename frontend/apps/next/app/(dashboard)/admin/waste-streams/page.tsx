import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { WasteStreamsListScreen } from '@/features/admin/WasteStreamsListScreen'

export const metadata: Metadata = { title: 'Corrientes Y/A' }

export default function AdminWasteStreamsPage() {
  return (
    <>
      <SetPageTitle title="Corrientes Y/A" />
      <WasteStreamsListScreen />
    </>
  )
}
