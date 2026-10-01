'use client'

import { useState } from 'react'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/**
 * Serializa una fecha a "YYYY-MM-DD" en hora LOCAL del navegador -- nunca
 * `date.toISOString()`, que trunca en UTC y puede desfasar un día (p.ej.
 * medianoche en Bogotá, UTC-5, cae en el día anterior en UTC). Mismo
 * criterio ya usado por `toDateOnly()` en `PlantReceptionAgendaScreen.tsx`.
 */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfLocalDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + amount)
  return result
}

export interface ScheduleDateNavigatorProps {
  date: Date
  onDateChange: (date: Date) => void
}

/**
 * Navegador de fecha de la vista "Programación por Localidad" -- flechas
 * prev/next (día a día), botón "Hoy", y `Popover`+`Calendar` (shadcn) para
 * saltar a cualquier fecha directamente.
 */
export function ScheduleDateNavigator({ date, onDateChange }: ScheduleDateNavigatorProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Día anterior"
        onClick={() => onDateChange(addDays(date, -1))}
      >
        <ChevronLeftIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Día siguiente"
        onClick={() => onDateChange(addDays(date, 1))}
      >
        <ChevronRightIcon aria-hidden="true" />
      </Button>
      <Button type="button" variant="outline" onClick={() => onDateChange(startOfLocalDay(new Date()))}>
        Hoy
      </Button>

      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
        <PopoverTrigger
          render={
            <Button type="button" variant="outline">
              <CalendarIcon aria-hidden="true" />
              {LONG_DATE_FORMATTER.format(date)}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(selected) => {
              if (!selected) return
              onDateChange(startOfLocalDay(selected))
              setIsCalendarOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
