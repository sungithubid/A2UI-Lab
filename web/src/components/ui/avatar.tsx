import * as Primitive from '@radix-ui/react-avatar'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
export function Avatar({ className, ...props }: ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      className={cn('relative flex size-9 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    />
  )
}
export function AvatarImage({ className, ...props }: ComponentProps<typeof Primitive.Image>) {
  return <Primitive.Image className={cn('size-full object-cover', className)} {...props} />
}
export function AvatarFallback({ className, ...props }: ComponentProps<typeof Primitive.Fallback>) {
  return (
    <Primitive.Fallback
      className={cn(
        'flex size-full items-center justify-center bg-accent font-semibold text-primary',
        className,
      )}
      {...props}
    />
  )
}
