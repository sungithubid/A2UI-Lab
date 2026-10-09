import * as Primitive from '@radix-ui/react-select'
import type { ComponentProps } from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
export const Select = Primitive.Root
export const SelectValue = Primitive.Value
export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      className={cn(
        'flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 [&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <Primitive.Icon>
        <ChevronDown size={16} />
      </Primitive.Icon>
    </Primitive.Trigger>
  )
}
export function SelectContent({
  children,
  className,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        position="popper"
        sideOffset={4}
        className={cn(
          'z-50 max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border bg-white shadow-lg',
          className,
        )}
        {...props}
      >
        <Primitive.ScrollUpButton className="flex justify-center">
          <ChevronUp size={16} />
        </Primitive.ScrollUpButton>
        <Primitive.Viewport className="p-1">{children}</Primitive.Viewport>
        <Primitive.ScrollDownButton className="flex justify-center">
          <ChevronDown size={16} />
        </Primitive.ScrollDownButton>
      </Primitive.Content>
    </Primitive.Portal>
  )
}
export function SelectItem({
  children,
  className,
  ...props
}: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={cn(
        'relative cursor-default rounded-md py-2 pl-8 pr-3 text-sm outline-none focus:bg-accent data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <Primitive.ItemIndicator className="absolute left-2 top-2.5">
        <Check size={14} />
      </Primitive.ItemIndicator>
      <Primitive.ItemText>{children}</Primitive.ItemText>
    </Primitive.Item>
  )
}
