import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"

import { cn } from "@/lib/utils"

function Collapsible({ className, ...props }: CollapsiblePrimitive.Root.Props) {
  return (
    <CollapsiblePrimitive.Root
      data-slot="collapsible"
      className={cn("flex w-full flex-col", className)}
      {...props}
    />
  )
}

function CollapsibleTrigger({
  className,
  ...props
}: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      className={cn(className)}
      {...props}
    />
  )
}

function CollapsibleContent({
  className,
  children,
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      className={cn(
        "overflow-hidden data-open:animate-accordion-down data-closed:animate-accordion-up",
        className
      )}
      {...props}
    >
      {children}
    </CollapsiblePrimitive.Panel>
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
