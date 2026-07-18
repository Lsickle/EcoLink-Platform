"use client"

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"

import { cn } from "@/lib/utils"
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react"

const Combobox = ComboboxPrimitive.Root

// `Combobox.Value` no renderiza su propio elemento HTML (solo el valor
// seleccionado como texto/render-prop) -- a diferencia de `SelectValue`, no
// acepta `className`/`data-slot`, se reexporta tal cual.
const ComboboxValue = ComboboxPrimitive.Value

function ComboboxIcon({ className, ...props }: ComboboxPrimitive.Icon.Props) {
  return (
    <ComboboxPrimitive.Icon
      data-slot="combobox-icon"
      className={cn("pointer-events-none flex items-center", className)}
      {...props}
    >
      <ChevronDownIcon className="size-4 text-muted-foreground" />
    </ComboboxPrimitive.Icon>
  )
}

// Botón que abre el popup -- equivalente al `SelectTrigger`, pero también
// sirve como "trigger" de un combobox estilo "buscador dentro de popup"
// (`Combobox.Input` anidado en `ComboboxContent`, ver ese caso de uso en
// `MultiChipPicker`). Estilo base = mismos tokens que `SelectTrigger`;
// consumidores pueden sobreescribir la forma vía `className` (p. ej. el
// botón "+ Agregar" de `MultiChipPicker` usa `rounded-full`+`border-dashed`).
function ComboboxTrigger({
  className,
  children,
  ...props
}: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
    </ComboboxPrimitive.Trigger>
  )
}

function ComboboxInputGroup({ className, ...props }: ComboboxPrimitive.InputGroup.Props) {
  return (
    <ComboboxPrimitive.InputGroup
      data-slot="combobox-input-group"
      className={cn("flex items-center gap-1.5", className)}
      {...props}
    />
  )
}

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

// Contenedor de los chips seleccionados -- parte NATIVA de Base UI para
// selección múltiple (`multiple` + `Combobox.Chips`/`Combobox.Chip`/
// `Combobox.ChipRemove`), reemplaza el `<span>` hecho a mano que tenía
// `MultiChipPicker` antes de este cambio.
function ComboboxChips({ className, ...props }: ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn("flex flex-1 flex-wrap items-center gap-2", className)}
      {...props}
    />
  )
}

function ComboboxChip({ className, children, ...props }: ComboboxPrimitive.Chip.Props) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium outline-none",
        className
      )}
      {...props}
    >
      {children}
    </ComboboxPrimitive.Chip>
  )
}

function ComboboxChipRemove({ className, children, ...props }: ComboboxPrimitive.ChipRemove.Props) {
  return (
    <ComboboxPrimitive.ChipRemove
      data-slot="combobox-chip-remove"
      className={cn(
        "flex items-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    >
      {children ?? <XIcon className="size-3" />}
    </ComboboxPrimitive.ChipRemove>
  )
}

function ComboboxClear({ className, children, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      className={cn(
        "flex items-center text-muted-foreground outline-none hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children ?? <XIcon />}
    </ComboboxPrimitive.Clear>
  )
}

// Positioner + Popup (portados) -- misma convención que `SelectContent`, pero
// SIN `w-(--anchor-width)` (el ancho del popup de un combobox filtrable no
// tiene por qué igualar el ancho del trigger, p. ej. el botón "+ Agregar" de
// `MultiChipPicker` es angosto pero el popup necesita espacio para
// label+sublabel).
function ComboboxContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignOffset = 0,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<ComboboxPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "relative isolate z-50 flex max-h-(--available-height) w-72 flex-col gap-2 overflow-hidden rounded-lg bg-popover p-2 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn("flex max-h-48 flex-col overflow-y-auto", className)}
      {...props}
    />
  )
}

const ComboboxCollection = ComboboxPrimitive.Collection

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group
      data-slot="combobox-group"
      className={cn("scroll-my-1", className)}
      {...props}
    />
  )
}

function ComboboxGroupLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-group-label"
      className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-default flex-col items-start gap-0.5 rounded-md px-2 py-1.5 pr-7 text-left text-xs outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </ComboboxPrimitive.Item>
  )
}

function ComboboxItemIndicator({ className, children, ...props }: ComboboxPrimitive.ItemIndicator.Props) {
  return (
    <ComboboxPrimitive.ItemIndicator
      data-slot="combobox-item-indicator"
      className={cn(
        "pointer-events-none absolute top-1/2 right-2 flex size-4 -translate-y-1/2 items-center justify-center",
        className
      )}
      {...props}
    >
      {children ?? <CheckIcon className="size-3.5" />}
    </ComboboxPrimitive.ItemIndicator>
  )
}

// `role="status"` + `aria-live="polite"` propios del primitivo -- SIEMPRE
// montado (ver advertencia de Base UI: ocultar con `display:none`/desmontar
// condicionalmente rompe el anuncio a lectores de pantalla). `empty:` colapsa
// el padding a 0 cuando no hay texto (lista no vacía), sin usar `hidden`.
function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground empty:p-0", className)}
      {...props}
    />
  )
}

function ComboboxStatus({ className, ...props }: ComboboxPrimitive.Status.Props) {
  return (
    <ComboboxPrimitive.Status
      data-slot="combobox-status"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxClear,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxIcon,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxStatus,
  ComboboxTrigger,
  ComboboxValue,
}
