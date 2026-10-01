import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { PermissionsMatrixScreen } from '@/features/admin/PermissionsMatrixScreen'

export const metadata: Metadata = { title: 'Matriz de Permisos' }

export default function AdminPermissionsMatrixPage() {
  return (
    <>
      <SetPageTitle title="Matriz de Permisos" />
      <PermissionsMatrixScreen />
    </>
  )
}
