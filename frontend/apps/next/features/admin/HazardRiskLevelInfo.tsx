'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  HAZARD_RISK_LEVEL_CLASSES,
  HAZARD_RISK_LEVEL_LABELS,
  hazardRiskLevel,
} from 'app/features/admin/hazardRiskLevel'

// Ayuda contextual del badge de nivel de riesgo de las Características de
// Peligrosidad (pedido del usuario, 2026-08-14): el badge mostraba
// "Crítico"/"Alto"/… sin decir de dónde salía ese nivel ni qué autoridad
// tiene.
//
// Los umbrales se declaran aquí, pero las ETIQUETAS y COLORES de cada fila se
// derivan llamando a `hazardRiskLevel()` -- la misma función que pinta los
// badges reales. Así la leyenda no puede quedar desincronizada si alguien
// mueve los cortes; escribir la tabla a mano sí lo permitiría.
const RISK_LEVEL_THRESHOLDS = [9, 7, 5, 3, 1]

// Se exporta aparte del tooltip para poder testear la leyenda directamente:
// el contenido del tooltip vive en un portal y solo existe cuando está
// abierto, así que verificarlo a través del disparador sería frágil.
export function HazardRiskLevelLegend() {
  return (
    <>
      <p className="text-xs font-semibold">Nivel de riesgo</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Se deriva del valor <span className="font-medium text-foreground">risk_level</span> (1 a 9) de cada
        característica: a mayor número, mayor peligrosidad.
      </p>

      <table className="mt-2 w-full text-xs">
        <tbody>
          {RISK_LEVEL_THRESHOLDS.map((threshold) => {
            const level = hazardRiskLevel(threshold)

            return (
              <tr key={threshold}>
                <td className="py-0.5 pr-2">
                  <span
                    className={`inline-flex min-w-8 justify-center rounded-full px-2 py-0.5 font-semibold ${HAZARD_RISK_LEVEL_CLASSES[level]}`}
                  >
                    ≥{threshold}
                  </span>
                </td>
                <td className="py-0.5">{HAZARD_RISK_LEVEL_LABELS[level]}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
        Es una escala <span className="font-medium text-foreground">informativa de la plataforma</span>, no un rango
        normativo: no proviene de la regulación RESPEL ni de ninguna norma oficial.
      </p>
    </>
  )
}

export function HazardRiskLevelInfo() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            // El tooltip abre con hover Y con foco de teclado (Base UI), así
            // que la ayuda no queda fuera del alcance de quien no usa mouse.
            aria-label="Cómo se calcula el nivel de riesgo"
            className="inline-flex size-4 items-center justify-center rounded-full bg-blue-500/15 text-[10px] font-bold text-blue-700 dark:text-blue-400"
          >
            ?
          </button>
        }
      />
      {/* El estilo por defecto del tooltip es una línea corta invertida
          (`bg-foreground`/`inline-flex`); aquí se sobrescribe a una tarjeta
          con la superficie normal, porque sobre el fondo invertido los chips
          de color no se leerían. */}
      <TooltipContent side="right" className="block max-w-xs border border-border bg-popover p-3 text-popover-foreground">
        <HazardRiskLevelLegend />
      </TooltipContent>
    </Tooltip>
  )
}
