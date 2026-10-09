import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
const variants = cva('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium', {
  variants: {
    variant: {
      default: 'bg-primary text-white',
      secondary: 'bg-accent text-primary',
      outline: 'border text-muted-foreground',
      destructive: 'bg-red-100 text-red-800',
    },
  },
  defaultVariants: { variant: 'secondary' },
})
export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof variants>) {
  return <span className={cn(variants({ variant }), className)} {...props} />
}
