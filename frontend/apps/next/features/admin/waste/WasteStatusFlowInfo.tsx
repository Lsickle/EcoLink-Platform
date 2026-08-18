'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// Ayuda contextual del flujo de estados de un residuo (pedido del usuario,
// 2026-08-14): la columna "Estado" dice dónde está el residuo, pero no qué
// viene antes ni después, ni -- lo más importante -- si ya sirve para una
// Solicitud de Servicio.
//
// Los estados y sus transiciones se toman del backend REAL (`Waste::STATUS_*`,
// `WasteController` y `WasteTreatmentApprovalController`), no del catálogo de
// etiquetas: ver la nota sobre "Rechazado" más abajo.
const FLOW: { code: string; label: string; hint: string; className: string }[] = [
  {
    code: 'BR',
    label: 'Borrador',
    hint: 'Se está diligenciando. Solo lo ve su propia organización.',
    className: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  },
  {
    code: 'DEC',
    label: 'Declarado',
    hint: 'Ya es visible para los Gestores con los que hay relación comercial.',
    className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  },
  {
    code: 'REV',
    label: 'En Revisión',
    hint: 'Un Gestor lo tomó para evaluarlo.',
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  },
  {
    code: 'CLS',
    label: 'Clasificado',
    hint: 'El Gestor le asignó un tratamiento. Falta el visto bueno final.',
    className: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  },
  {
    code: 'APR',
    label: 'Aprobado',
    hint: 'Listo: ya se puede usar en Solicitudes de Servicio.',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
]

// Se exporta aparte del tooltip para poder testear el contenido directamente:
// el popup vive en un portal y solo existe mientras está abierto.
export function WasteStatusFlowLegend() {
  return (
    <>
      <p className="text-xs font-semibold">Flujo de estados del residuo</p>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {FLOW.map((step, index) => (
          <span key={step.code} className="flex items-center gap-1">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${step.className}`}>{step.label}</span>
            {index < FLOW.length - 1 && <span aria-hidden="true" className="text-muted-foreground">→</span>}
          </span>
        ))}
      </div>

      <ul className="mt-2 flex flex-col gap-1">
        {FLOW.map((step) => (
          <li key={step.code} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{step.label}:</span> {step.hint}
          </li>
        ))}
      </ul>

      {/* El rechazo devuelve a Declarado, NO a Borrador: rechaza esa
          evaluación, no el residuo, así que sigue disponible para los demás
          Gestores vinculados. */}
      <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
        Si un Gestor rechaza la evaluación, el residuo vuelve a{' '}
        <span className="font-medium text-foreground">Declarado</span> con la observación del motivo, y otro Gestor
        puede evaluarlo.
      </p>

      {/* La duda concreta que originó esta ayuda: antes el estado NO decía si
          el residuo ya se podía usar -- eso dependía de un eje aparte e
          invisible. Desde 2026-08-14 el estado es la única señal. */}
      <p className="mt-2 rounded-md bg-emerald-500/10 p-2 text-xs text-foreground">
        <span className="font-semibold">Solo un residuo Aprobado</span> puede usarse en una Solicitud de Servicio.
        Llegar a Clasificado no basta: falta el visto bueno final del Gestor.
      </p>

      <p className="mt-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Suspendido:</span> solo EcoLink puede retirar de circulación un
        residuo ya Aprobado, y puede reactivarlo. Se conserva toda su trazabilidad.
      </p>

      {/* Anotación pedida por el usuario (2026-08-18): dejar constancia visible
          de que "Aprobar con Restricciones" se retiró a la espera de validarlo
          con los stakeholders, para que nadie lo busque creyendo que falta. */}
      <p className="mt-2 rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Aprobar con Restricciones — retirado temporalmente.</span> Una
        evaluación podía quedar en ese estado con solo escribir una condición (por ejemplo «máximo 500 kg/mes»), y ese
        estado no contaba como tratamiento viable: la condición de servicio terminaba comportándose como un rechazo.
        Se retiró el 18/08/2026 mientras se valida con los stakeholders. Hoy aprobar es aprobar, y las restricciones se
        registran como término de la evaluación.
      </p>
    </>
  )
}

export function WasteStatusFlowInfo() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            // Abre con hover Y con foco de teclado (Base UI), igual que
            // `HazardRiskLevelInfo`.
            aria-label="Ver el flujo de estados del residuo"
            className="inline-flex size-4 items-center justify-center rounded-full bg-blue-500/15 text-[10px] font-bold text-blue-700 dark:text-blue-400"
          >
            ?
          </button>
        }
      />
      <TooltipContent side="bottom" className="block max-w-sm border border-border bg-popover p-3 text-popover-foreground">
        <WasteStatusFlowLegend />
      </TooltipContent>
    </Tooltip>
  )
}
