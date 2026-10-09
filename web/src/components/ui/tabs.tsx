import * as Primitive from '@radix-ui/react-tabs'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
export const Tabs = Primitive.Root
export function TabsList({ className, ...props }: ComponentProps<typeof Primitive.List>) {
  return (
    <Primitive.List className={cn('inline-flex rounded-lg bg-accent p-1', className)} {...props} />
  )
}
export function TabsTrigger({ className, ...props }: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      className={cn(
        'rounded-md px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary data-[state=active]:bg-white data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  )
}
export function TabsContent({ className, ...props }: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Content
      className={cn('mt-5 outline-none focus-visible:ring-2 focus-visible:ring-primary', className)}
      {...props}
    />
  )
}
