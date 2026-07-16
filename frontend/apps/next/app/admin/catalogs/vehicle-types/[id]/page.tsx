'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { VehicleTypeDetailScreen } from '@/features/admin/catalogs/VehicleTypeDetailScreen'

const useVehicleTypeDetailParams = useParams<{ id: string }>

export default function AdminVehicleTypeDetailPage() {
  const { id } = useVehicleTypeDetailParams()

  return (
    <DashboardShell title="Detalle de Tipo de Vehículo">
      <VehicleTypeDetailScreen vehicleTypeId={id} />
    </DashboardShell>
  )
}
