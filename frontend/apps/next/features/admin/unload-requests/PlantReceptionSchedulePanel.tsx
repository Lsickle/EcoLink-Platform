'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ApiValidationError,
  confirmPlantReceptionSchedule,
  counterProposePlantReceptionSchedule,
  fetchBranchLocations,
  proposePlantReceptionSchedule,
  reschedulePlantReceptionSchedule,
  type AdminBranchLocation,
  type AdminPlantReceptionSchedule,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

// `formatDate()` compartido (formatDate.ts) solo formatea el día -- las
// franjas necesitan también la hora, por eso una variante local en vez de
// tocar el helper compartido (usado y probado en otras pantallas).
function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

const ROLE_LABELS: Record<string, string> = {
  LOGISTICS_COORDINATOR: 'Coordinador Logístico (transportador)',
  GENERATOR: 'Generador (autotransporte)',
  RECEPTION_COORDINATOR: 'Coordinador de Recepción (planta)',
}

const STATUS_LABELS: Record<AdminPlantReceptionSchedule['status'], string> = {
  PROPOSED: 'Propuesta',
  COUNTER_PROPOSED: 'Contrapropuesta',
  CONFIRMED: 'Confirmada',
  SUPERSEDED: 'Superada',
}

const STATUS_BADGE_VARIANT: Record<AdminPlantReceptionSchedule['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PROPOSED: 'outline',
  COUNTER_PROPOSED: 'secondary',
  CONFIRMED: 'default',
  SUPERSEDED: 'destructive',
}

function SlotFields({
  idPrefix,
  dockLocationId,
  onDockLocationIdChange,
  dockLocations,
  date,
  onDateChange,
  startAt,
  onStartAtChange,
  endAt,
  onEndAtChange,
}: {
  idPrefix: string
  dockLocationId: number | null
  onDockLocationIdChange: (value: number | null) => void
  dockLocations: AdminBranchLocation[]
  date: string
  onDateChange: (value: string) => void
  startAt: string
  onStartAtChange: (value: string) => void
  endAt: string
  onEndAtChange: (value: string) => void
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-date`}>Fecha de Recepción</Label>
        <Input id={`${idPrefix}-date`} type="date" value={date} onChange={(event) => onDateChange(event.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-startAt`}>Hora de Inicio</Label>
          <Input
            id={`${idPrefix}-startAt`}
            type="datetime-local"
            value={startAt}
            onChange={(event) => onStartAtChange(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-endAt`}>Hora de Fin Estimada</Label>
          <Input
            id={`${idPrefix}-endAt`}
            type="datetime-local"
            value={endAt}
            onChange={(event) => onEndAtChange(event.target.value)}
          />
        </div>
      </div>
      {dockLocations.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-dock`}>
            Muelle Asignado <span className="text-muted-foreground">(opcional)</span>
          </Label>
          <Select
            items={[
              { value: 'none', label: 'Sin muelle asignado' },
              ...dockLocations.map((dock) => ({ value: String(dock.id), label: `${dock.code} — ${dock.name}` })),
            ]}
            value={dockLocationId !== null ? String(dockLocationId) : 'none'}
            onValueChange={(value) => onDockLocationIdChange(value === 'none' ? null : Number(value))}
          >
            <SelectTrigger id={`${idPrefix}-dock`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin muelle asignado</SelectItem>
              {dockLocations.map((dock) => (
                <SelectItem key={dock.id} value={String(dock.id)}>
                  {dock.code} — {dock.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  )
}

function ScheduleSlotSummary({
  title,
  date,
  startAt,
  endAt,
  dockLabel,
  proposerLabel,
}: {
  title: string
  date: string
  startAt: string
  endAt: string
  dockLabel: string
  proposerLabel: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <span className="text-xs font-semibold text-muted-foreground">{title}</span>
      <span className="text-sm font-medium">{formatDate(date)}</span>
      <span className="text-sm text-muted-foreground">
        {formatDateTime(startAt)} – {formatDateTime(endAt)}
      </span>
      <span className="text-xs text-muted-foreground">
        Muelle: <span className="font-medium text-foreground">{dockLabel}</span>
      </span>
      <span className="text-xs text-muted-foreground">
        Propuesta por: <span className="font-medium text-foreground">{proposerLabel}</span>
      </span>
    </div>
  )
}

/**
 * Panel de negociación bilateral de `plant_reception_schedules` (Fase 4
 * "Cita de Recepción en Planta"), embebido en `UnloadRequestDetailScreen`.
 *
 * FIDELIDAD A FIGMA: el formulario de "Programar Recepción" (propose, dialog
 * de este panel) sigue el node 991:14338 -- secciones "Planta y Fecha"
 * (Planta/Fecha ya se muestran en la cabecera del detalle, no se repiten
 * aquí) y "Franja Horaria y Muelle" (Hora Inicio/Fin/Muelle Asignado). Las
 * secciones "Operador y Recursos" e "Instrucciones Especiales" del frame de
 * Figma se OMITEN a propósito -- `PlantReceptionScheduleController::propose()`
 * (`slotValidationRules()`) NO acepta esos campos (sin operador/equipos/
 * notificaciones en `plant_reception_schedules`), y este agente no inventa
 * campos que el backend real no soporta (ver resumen del lote).
 *
 * EXTENSIÓN PROPIA (sin frame de Figma -- el frame confirmado solo cubre el
 * lado propuesta/confirmación): la vista de "Contrapropuesta" (2 franjas
 * lado a lado, con quién propuso cada una) y los botones Contraproponer/
 * Confirmar/Reprogramar, diseñados aquí siguiendo el mismo lenguaje visual
 * (Card + badges de estado + diálogos de formulario) ya usado en el resto de
 * este módulo.
 */
export function PlantReceptionSchedulePanel({
  unloadRequestId,
  unloadRequestStatusCode,
  receivingBranchId,
  schedule,
  canManage,
  onChanged,
}: {
  unloadRequestId: number | string
  unloadRequestStatusCode: string | undefined
  receivingBranchId: number
  schedule: AdminPlantReceptionSchedule | null
  canManage: boolean
  onChanged: () => void
}) {
  const [dockLocations, setDockLocations] = useState<AdminBranchLocation[]>([])

  useEffect(() => {
    let cancelled = false
    fetchBranchLocations({ branchId: receivingBranchId, isActive: true, perPage: 100 })
      .then((result) => {
        if (!cancelled) setDockLocations(result.data)
      })
      .catch(() => {
        if (!cancelled) setDockLocations([])
      })
    return () => {
      cancelled = true
    }
  }, [receivingBranchId])

  const [proposeOpen, setProposeOpen] = useState(false)
  const [proposeDockId, setProposeDockId] = useState<number | null>(null)
  const [proposeDate, setProposeDate] = useState('')
  const [proposeStartAt, setProposeStartAt] = useState('')
  const [proposeEndAt, setProposeEndAt] = useState('')
  const [proposeError, setProposeError] = useState<string | null>(null)
  const [isProposing, setIsProposing] = useState(false)

  const [counterOpen, setCounterOpen] = useState(false)
  const [counterDate, setCounterDate] = useState('')
  const [counterStartAt, setCounterStartAt] = useState('')
  const [counterEndAt, setCounterEndAt] = useState('')
  const [counterError, setCounterError] = useState<string | null>(null)
  const [isCounterProposing, setIsCounterProposing] = useState(false)

  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [rescheduleDockId, setRescheduleDockId] = useState<number | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleStartAt, setRescheduleStartAt] = useState('')
  const [rescheduleEndAt, setRescheduleEndAt] = useState('')
  const [rescheduleReason, setRescheduleReason] = useState('')
  const [rescheduleError, setRescheduleError] = useState<string | null>(null)
  const [isRescheduling, setIsRescheduling] = useState(false)

  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)

  async function handlePropose(event: React.FormEvent) {
    event.preventDefault()
    setProposeError(null)
    if (!proposeDate || !proposeStartAt || !proposeEndAt) {
      setProposeError('Completa fecha, hora de inicio y hora de fin.')
      return
    }
    setIsProposing(true)
    try {
      await proposePlantReceptionSchedule(unloadRequestId, {
        dock_location_id: proposeDockId ?? undefined,
        scheduled_date: proposeDate,
        scheduled_start_at: proposeStartAt,
        scheduled_end_at: proposeEndAt,
      })
      setProposeOpen(false)
      onChanged()
    } catch (error) {
      setProposeError(errorMessage(error, 'scheduled_date'))
    } finally {
      setIsProposing(false)
    }
  }

  async function handleCounterPropose(event: React.FormEvent) {
    event.preventDefault()
    setCounterError(null)
    if (!schedule || !counterDate || !counterStartAt || !counterEndAt) {
      setCounterError('Completa fecha, hora de inicio y hora de fin.')
      return
    }
    setIsCounterProposing(true)
    try {
      await counterProposePlantReceptionSchedule(schedule.id, {
        counter_proposed_date: counterDate,
        counter_proposed_start_at: counterStartAt,
        counter_proposed_end_at: counterEndAt,
      })
      setCounterOpen(false)
      onChanged()
    } catch (error) {
      setCounterError(errorMessage(error, 'counter_proposed_date'))
    } finally {
      setIsCounterProposing(false)
    }
  }

  async function handleConfirm() {
    if (!schedule) return
    setConfirmError(null)
    setIsConfirming(true)
    try {
      await confirmPlantReceptionSchedule(schedule.id)
      onChanged()
    } catch (error) {
      // El backend rechaza con 422 si el actor pertenece al mismo lado que
      // hizo la última propuesta/contrapropuesta vigente (hallazgo de
      // seguridad 2026-07-19) -- se muestra el mensaje del backend tal cual.
      setConfirmError(errorMessage(error, 'confirmed_by'))
    } finally {
      setIsConfirming(false)
    }
  }

  async function handleReschedule(event: React.FormEvent) {
    event.preventDefault()
    setRescheduleError(null)
    if (!schedule || !rescheduleDate || !rescheduleStartAt || !rescheduleEndAt || !rescheduleReason.trim()) {
      setRescheduleError('Completa fecha, horas y el motivo de la reprogramación.')
      return
    }
    setIsRescheduling(true)
    try {
      await reschedulePlantReceptionSchedule(schedule.id, {
        dock_location_id: rescheduleDockId ?? undefined,
        scheduled_date: rescheduleDate,
        scheduled_start_at: rescheduleStartAt,
        scheduled_end_at: rescheduleEndAt,
        reschedule_reason: rescheduleReason.trim(),
      })
      setRescheduleOpen(false)
      onChanged()
    } catch (error) {
      setRescheduleError(errorMessage(error, 'scheduled_date'))
    } finally {
      setIsRescheduling(false)
    }
  }

  if (unloadRequestStatusCode !== 'APPROVED') {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            La franja de recepción en planta solo puede proponerse sobre una solicitud Aprobada (RN-RCP-015).
          </p>
        </CardContent>
      </Card>
    )
  }

  const dockLabel = (dockLocationId: number | null | undefined) => {
    if (!dockLocationId) return '—'
    const dock = dockLocations.find((item) => item.id === dockLocationId)
    return dock ? `${dock.code} — ${dock.name}` : `Muelle #${dockLocationId}`
  }

  if (!schedule) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Cita de Recepción en Planta</CardTitle>
          {canManage && (
            <Dialog open={proposeOpen} onOpenChange={setProposeOpen}>
              <DialogTrigger render={<Button size="sm">+ Programar Recepción</Button>} />
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Programar Recepción</DialogTitle>
                </DialogHeader>
                <form onSubmit={handlePropose} className="flex flex-col gap-3" noValidate>
                  <SlotFields
                    idPrefix="propose"
                    dockLocationId={proposeDockId}
                    onDockLocationIdChange={setProposeDockId}
                    dockLocations={dockLocations}
                    date={proposeDate}
                    onDateChange={setProposeDate}
                    startAt={proposeStartAt}
                    onStartAtChange={setProposeStartAt}
                    endAt={proposeEndAt}
                    onEndAtChange={setProposeEndAt}
                  />
                  {proposeError && (
                    <p className="text-sm text-destructive" role="alert">
                      {proposeError}
                    </p>
                  )}
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setProposeOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={isProposing}>
                      {isProposing ? 'Confirmando…' : '✓ Confirmar Recepción'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Todavía no se ha propuesto ninguna franja de recepción.</p>
        </CardContent>
      </Card>
    )
  }

  const canCounterProposeOrConfirm = canManage && ['PROPOSED', 'COUNTER_PROPOSED'].includes(schedule.status)
  const canReschedule = canManage && schedule.status === 'CONFIRMED'

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Cita de Recepción en Planta</CardTitle>
        <Badge variant={STATUS_BADGE_VARIANT[schedule.status]}>{STATUS_LABELS[schedule.status]}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ScheduleSlotSummary
            title="Propuesta Original"
            date={schedule.scheduled_date}
            startAt={schedule.scheduled_start_at}
            endAt={schedule.scheduled_end_at}
            dockLabel={dockLabel(schedule.dock_location_id)}
            proposerLabel={
              schedule.proposed_by_user?.username ?? ROLE_LABELS[schedule.proposed_by_role] ?? schedule.proposed_by_role
            }
          />
          {schedule.status === 'COUNTER_PROPOSED' && schedule.counter_proposed_date && (
            <ScheduleSlotSummary
              title="Contrapropuesta"
              date={schedule.counter_proposed_date}
              startAt={schedule.counter_proposed_start_at ?? ''}
              endAt={schedule.counter_proposed_end_at ?? ''}
              dockLabel={dockLabel(schedule.dock_location_id)}
              // AVISO: el backend NO eager-carga `counterProposedByUser` en
              // `show()` -- solo se conoce el ID, no el nombre (ver AVISO en
              // `AdminPlantReceptionSchedule`, types.ts). Se muestra el ID
              // como fallback en vez de inventar un nombre.
              proposerLabel={schedule.counter_proposed_by ? `Usuario #${schedule.counter_proposed_by}` : '—'}
            />
          )}
        </div>

        {confirmError && (
          <p className="text-sm text-destructive" role="alert">
            {confirmError}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {canCounterProposeOrConfirm && (
            <>
              <Dialog open={counterOpen} onOpenChange={setCounterOpen}>
                <DialogTrigger render={<Button size="sm" variant="outline">Contraproponer</Button>} />
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Contraproponer Franja</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCounterPropose} className="flex flex-col gap-3" noValidate>
                    <SlotFields
                      idPrefix="counter"
                      dockLocationId={null}
                      onDockLocationIdChange={() => {}}
                      dockLocations={[]}
                      date={counterDate}
                      onDateChange={setCounterDate}
                      startAt={counterStartAt}
                      onStartAtChange={setCounterStartAt}
                      endAt={counterEndAt}
                      onEndAtChange={setCounterEndAt}
                    />
                    {counterError && (
                      <p className="text-sm text-destructive" role="alert">
                        {counterError}
                      </p>
                    )}
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setCounterOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={isCounterProposing}>
                        {isCounterProposing ? 'Enviando…' : 'Contraproponer'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              <Button size="sm" disabled={isConfirming} onClick={handleConfirm}>
                {isConfirming ? 'Confirmando…' : 'Confirmar'}
              </Button>
            </>
          )}
          {canReschedule && (
            <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
              <DialogTrigger render={<Button size="sm" variant="outline">Reprogramar</Button>} />
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Reprogramar Recepción</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleReschedule} className="flex flex-col gap-3" noValidate>
                  <SlotFields
                    idPrefix="reschedule"
                    dockLocationId={rescheduleDockId}
                    onDockLocationIdChange={setRescheduleDockId}
                    dockLocations={dockLocations}
                    date={rescheduleDate}
                    onDateChange={setRescheduleDate}
                    startAt={rescheduleStartAt}
                    onStartAtChange={setRescheduleStartAt}
                    endAt={rescheduleEndAt}
                    onEndAtChange={setRescheduleEndAt}
                  />
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reschedule-reason">Motivo de la Reprogramación</Label>
                    <Input
                      id="reschedule-reason"
                      value={rescheduleReason}
                      onChange={(event) => setRescheduleReason(event.target.value)}
                    />
                  </div>
                  {rescheduleError && (
                    <p className="text-sm text-destructive" role="alert">
                      {rescheduleError}
                    </p>
                  )}
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setRescheduleOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={isRescheduling}>
                      {isRescheduling ? 'Reprogramando…' : 'Reprogramar'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
