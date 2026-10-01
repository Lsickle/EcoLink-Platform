'use client'

import { useEffect, useState, type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EcoLinkSpinner } from '@/components/ecolink-spinner'
import type { AdminBranch, AdminTransportPersonnel, AdminVehicle } from 'app/features/admin/api'
import type { PendingDropInfo, ScheduleAssignmentSelection } from './useTransportScheduleCalendarState'

export interface ScheduleAssignmentDialogProps {
  open: boolean
  pendingDrop: PendingDropInfo | null
  /** Mismo catálogo que `assistants` (`transport_personnel`, sin distinción de rol -- ver `fetchTransportPersonnel()`). */
  drivers: AdminTransportPersonnel[]
  assistants: AdminTransportPersonnel[]
  vehicles: AdminVehicle[]
  branches: AdminBranch[]
  isSubmitting: boolean
  submitError: string | null
  onConfirm: (selection: ScheduleAssignmentSelection) => void
  onCancel: () => void
  /**
   * Portal del diálogo dentro de este contenedor en vez del `document.body`
   * por defecto, para que herede el acento azul escopeado a
   * `.transport-schedule-calendar` (ver `TransportScheduleCalendarWorkspace.tsx`).
   */
  portalContainer?: RefObject<HTMLElement | null>
}

function personnelLabel(person: AdminTransportPersonnel, fallbackPrefix: string): string {
  const name = person.person?.full_name ?? `${fallbackPrefix} #${person.id}`
  return person.license_number ? `${name} · ${person.license_number}` : name
}

/**
 * Modal de confirmación de conductor/auxiliar/vehículo/sede de destino que
 * se abre al soltar una solicitud sobre el calendario. Crea una
 * `transport_schedule` REAL (`POST /admin/transport-schedules`, mismo
 * endpoint y contrato que `CreateTransportScheduleForm.tsx`) -- ya no es un
 * stub sin fetch real ni persistencia. Los ítems a programar se
 * auto-seleccionan (TODOS los elegibles, a su cantidad estimada completa)
 * antes de llegar aquí, en `useTransportScheduleCalendarState.beginDrop()`
 * -- este diálogo solo pide lo que no tiene un valor por defecto razonable.
 */
export function ScheduleAssignmentDialog({
  open,
  pendingDrop,
  drivers,
  assistants,
  vehicles,
  branches,
  isSubmitting,
  submitError,
  onConfirm,
  onCancel,
  portalContainer,
}: ScheduleAssignmentDialogProps) {
  const [driverId, setDriverId] = useState<number | null>(null)
  const [assistantId, setAssistantId] = useState<number | null>(null)
  const [vehicleId, setVehicleId] = useState<number | null>(null)
  const [destinationBranchId, setDestinationBranchId] = useState<number | null>(null)

  // Reset de la selección cada vez que cambia la solicitud soltada (incluye
  // el cierre del diálogo, donde `pendingDrop` vuelve a `null`).
  useEffect(() => {
    setDriverId(null)
    setAssistantId(null)
    setVehicleId(null)
    setDestinationBranchId(null)
  }, [pendingDrop?.request.id])

  const hasEligibleItems = Boolean(pendingDrop && !pendingDrop.isLoadingItems && pendingDrop.eligibleItems.length > 0)

  const canConfirm =
    Boolean(pendingDrop) &&
    hasEligibleItems &&
    driverId !== null &&
    vehicleId !== null &&
    destinationBranchId !== null &&
    !isSubmitting

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel()
        }
      }}
    >
      <DialogContent container={portalContainer}>
        <DialogHeader>
          <DialogTitle>Programar Servicio</DialogTitle>
          <DialogDescription>
            {pendingDrop ? `${pendingDrop.request.request_code} — ${pendingDrop.request.organization?.legal_name ?? '—'}` : ''}
          </DialogDescription>
        </DialogHeader>

        {!pendingDrop ? (
          <p className="text-sm text-muted-foreground">No hay una solicitud seleccionada.</p>
        ) : pendingDrop.isLoadingItems ? (
          <EcoLinkSpinner label="Cargando ítems de la solicitud…" />
        ) : (
          <div className="flex flex-col gap-3">
            {pendingDrop.itemsError && (
              <p className="text-sm text-destructive" role="alert">
                {pendingDrop.itemsError}
              </p>
            )}

            {hasEligibleItems && (
              <div className="flex flex-col gap-1 rounded-md border border-border p-2 text-sm">
                <p className="font-medium">Ítems a Programar (cantidad estimada completa)</p>
                <ul className="list-inside list-disc text-muted-foreground">
                  {pendingDrop.eligibleItems.map((item) => (
                    <li key={item.id}>
                      {item.waste_name_snapshot} — {item.estimated_quantity ?? 0}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scheduleAssignmentDriver">Conductor</Label>
              <Select
                items={drivers.map((driver) => ({ value: String(driver.id), label: personnelLabel(driver, 'Conductor') }))}
                value={driverId !== null ? String(driverId) : null}
                onValueChange={(value) => setDriverId(value !== null ? Number(value) : null)}
              >
                <SelectTrigger id="scheduleAssignmentDriver" aria-label="Conductor" className="w-full">
                  <SelectValue placeholder="Selecciona un conductor" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((driver) => (
                    <SelectItem key={driver.id} value={String(driver.id)}>
                      {personnelLabel(driver, 'Conductor')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {drivers.length === 0 && (
                <p className="text-xs text-muted-foreground">Esta organización no tiene conductores activos registrados todavía.</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scheduleAssignmentAssistant">
                Auxiliar <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Select
                items={assistants.map((assistant) => ({ value: String(assistant.id), label: personnelLabel(assistant, 'Auxiliar') }))}
                value={assistantId !== null ? String(assistantId) : null}
                onValueChange={(value) => setAssistantId(value !== null ? Number(value) : null)}
              >
                <SelectTrigger id="scheduleAssignmentAssistant" aria-label="Auxiliar" className="w-full">
                  <SelectValue placeholder="Selecciona un auxiliar" />
                </SelectTrigger>
                <SelectContent>
                  {assistants.map((assistant) => (
                    <SelectItem key={assistant.id} value={String(assistant.id)}>
                      {personnelLabel(assistant, 'Auxiliar')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scheduleAssignmentVehicle">Vehículo</Label>
              <Select
                items={vehicles.map((vehicle) => ({ value: String(vehicle.id), label: vehicle.plate_number }))}
                value={vehicleId !== null ? String(vehicleId) : null}
                onValueChange={(value) => setVehicleId(value !== null ? Number(value) : null)}
              >
                <SelectTrigger id="scheduleAssignmentVehicle" aria-label="Vehículo" className="w-full">
                  <SelectValue placeholder="Selecciona un vehículo" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={String(vehicle.id)}>
                      {vehicle.plate_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scheduleAssignmentDestinationBranch">Sede de Destino</Label>
              <Select
                items={branches.map((branch) => ({ value: String(branch.id), label: branch.name }))}
                value={destinationBranchId !== null ? String(destinationBranchId) : null}
                onValueChange={(value) => setDestinationBranchId(value !== null ? Number(value) : null)}
              >
                <SelectTrigger id="scheduleAssignmentDestinationBranch" aria-label="Sede de Destino" className="w-full">
                  <SelectValue placeholder="Selecciona una sede" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={String(branch.id)}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {submitError && (
          <p className="text-sm text-destructive" role="alert" aria-live="polite">
            {submitError}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            disabled={!canConfirm}
            onClick={() => {
              if (driverId === null || vehicleId === null || destinationBranchId === null) return
              onConfirm({ driverId, assistantId, vehicleId, destinationBranchId })
            }}
          >
            {isSubmitting ? 'Creando…' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
