"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

// Encabezado con una tinta AZUL translúcida, más suave que la del hover
// (10% vs 20%) para que se lea como fondo y no compita con la fila activa.
//
// Deliberadamente un alpha sobre la superficie, NO un color sólido por tema:
// así el tinte se MEZCLA con el fondo de cada tema, y en oscuro la banda
// nunca puede volverse clara. Un intento previo con colores sólidos por tema
// (`--table-header` en :root/.dark) se veía casi blanca con letras negras en
// modo oscuro si esas variables no llegaban a cargar; con alpha ese modo de
// fallo no existe, porque el color base del que parte es el del propio tema.
function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-sky-500/10 dark:bg-sky-400/12 [&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

// Filas alternadas (zebra) para que se lean más fácil de izquierda a derecha.
//
// Los estados interactivos van en VERDE grisáceo (verde de marca a baja
// opacidad, que al mezclarse con la superficie pierde saturación y queda como
// un verde apagado). Se usan EXACTAMENTE las mismas opacidades que la banda
// del encabezado (10% claro / 12% oscuro) para que el hover no pese más que
// ella -- el encabezado es la referencia fija de la tabla.
//
// La separación con el zebra ya no depende del tono sino del MATIZ: gris
// neutro = estructura, verde = interacción. Por eso funciona incluso con
// opacidades bajas, donde antes (gris contra gris) se perdía por completo.
//
// CUIDADO al tocar esto: en Tailwind v4 el `:nth-child(even)` se emite en el
// CSS DESPUÉS de `:hover`/`:has()`/`[data-state]`, y las cuatro reglas tienen
// la MISMA especificidad -- así que un `even:bg-*` a secas gana por orden de
// fuente y APAGA en las filas pares el resaltado al pasar el mouse, el de
// fila expandida y el de fila seleccionada (verificado compilando Tailwind:
// `:hover` en la pos. 43361 vs `:nth-child(even)` en la 58254). Por eso cada
// estado se repite con la variante `even:`: eso genera dos pseudo-clases
// (`:nth-child(even):hover`), que gana por ESPECIFICIDAD y ya no depende del
// orden en que Tailwind emita las reglas.
function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors even:bg-muted/30",
        "hover:bg-emerald-600/10 even:hover:bg-emerald-600/10 dark:hover:bg-emerald-400/12 dark:even:hover:bg-emerald-400/12",
        "has-aria-expanded:bg-emerald-600/10 even:has-aria-expanded:bg-emerald-600/10 dark:has-aria-expanded:bg-emerald-400/12 dark:even:has-aria-expanded:bg-emerald-400/12",
        "data-[state=selected]:bg-emerald-600/10 even:data-[state=selected]:bg-emerald-600/10 dark:data-[state=selected]:bg-emerald-400/12 dark:even:data-[state=selected]:bg-emerald-400/12",
        className
      )}
      {...props}
    />
  )
}

// El encabezado se distingue del contenido por TAMAÑO, CAJA y FONDO (más
// pequeño, mayúsculas, banda azul), no por ser más tenue: va en `font-bold`,
// por encima del `font-medium` que usan los nombres en las celdas. A 12px
// (`text-xs`) un `font-semibold` se percibía MÁS delgado que los nombres a
// 14px, aunque numéricamente pesara más -- de ahí el salto a bold.
//
// `text-foreground/80` en vez de un color propio: hereda el color de texto
// del tema, así que en oscuro los títulos salen blancos (como se espera) y en
// claro casi negros, sin reglas por tema ni riesgo de quedar invertidos.
function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle text-xs font-bold tracking-wide uppercase whitespace-nowrap text-foreground/80 [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
