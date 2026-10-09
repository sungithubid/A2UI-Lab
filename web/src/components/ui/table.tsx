import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full text-left text-sm', className)} {...props} />
    </div>
  )
}
export function TableHeader(props: ComponentProps<'thead'>) {
  return <thead {...props} />
}
export function TableBody(props: ComponentProps<'tbody'>) {
  return <tbody {...props} />
}
export function TableFooter(props: ComponentProps<'tfoot'>) {
  return <tfoot {...props} />
}
export function TableCaption({ className, ...props }: ComponentProps<'caption'>) {
  return <caption className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
}
export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-b last:border-0 hover:bg-accent/40', className)} {...props} />
}
export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn('h-11 whitespace-nowrap px-4 font-medium text-muted-foreground', className)}
      {...props}
    />
  )
}
export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('p-4', className)} {...props} />
}
