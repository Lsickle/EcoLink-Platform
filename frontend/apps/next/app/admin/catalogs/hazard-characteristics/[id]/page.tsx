'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { HazardCharacteristicDetailScreen } from '@/features/admin/catalogs/HazardCharacteristicDetailScreen'

const useHazardCharacteristicDetailParams = useParams<{ id: string }>

export default function AdminHazardCharacteristicDetailPage() {
  const { id } = useHazardCharacteristicDetailParams()

  return (
    <DashboardShell title="Detalle de Característica de Peligrosidad">
      <HazardCharacteristicDetailScreen hazardCharacteristicId={id} />
    </DashboardShell>
  )
}
