import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { DepartmentsListScreen } from '@/features/admin/catalogs/DepartmentsListScreen'

export const metadata: Metadata = { title: 'Departamentos' }

export default function AdminDepartmentsPage() {
  return (
    <>
      <SetPageTitle title="Departamentos" />
      <DepartmentsListScreen />
    </>
  )
}
