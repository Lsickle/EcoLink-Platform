'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { VehicleDetailScreen } from '@/features/admin/VehicleDetailScreen'

const useVehicleDetailParams = useParams<{ id: string }>

export default function AdminVehicleDetailPage() {
  const { id } = useVehicleDetailParams()

  return (
    <DashboardShell title="Detalle de Vehículo">
      <VehicleDetailScreen vehicleId={id} />
    </DashboardShell>
  )
}
