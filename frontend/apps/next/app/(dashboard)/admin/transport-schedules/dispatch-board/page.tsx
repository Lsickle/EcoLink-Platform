import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { TransportDispatchBoardScreen } from '@/features/admin/transport-schedules/TransportDispatchBoardScreen'

export const metadata: Metadata = { title: 'Tablero de Despacho — Agrupar en Rutas' }

export default function AdminTransportDispatchBoardPage() {
  return (
    <>
      <SetPageTitle title="Tablero de Despacho — Agrupar en Rutas" />
      <TransportDispatchBoardScreen />
    </>
  )
}
