import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { components } from '@/generated/api'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { ErrorState } from '@/components/states'

type Write = components['schemas']['Write']
export function NoteForm({
  initial,
  onSave,
  onCancel,
  pending,
  error,
}: {
  initial?: Write
  onSave: (values: Write) => void
  onCancel: () => void
  pending: boolean
  error: Error | null
}) {
  const { t } = useTranslation()
  const schema = z.object({
    title: z
      .string()
      .trim()
      .min(1, 'Give your note a title')
      .max(200, 'Use 200 characters or fewer'),
    content: z.string().max(20000, 'Use 20,000 characters or fewer'),
  })
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Write>({
    resolver: zodResolver(schema),
    defaultValues: initial ?? { title: '', content: '' },
  })
  return (
    <form className="space-y-5" onSubmit={handleSubmit(onSave)}>
      <div>
        <label htmlFor="note-title">{t('Title')}</label>
        <Input
          id="note-title"
          autoFocus
          placeholder={t('Give your idea a name')}
          maxLength={200}
          {...register('title')}
          aria-invalid={!!errors.title}
        />
        {errors.title && (
          <p role="alert" className="field-error">
            {t(errors.title.message ?? 'Please check your input.')}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="note-content">{t('Content')}</label>
        <Textarea
          id="note-content"
          placeholder={t('Start writing. Every idea begins somewhere\u2026')}
          maxLength={20000}
          {...register('content')}
        />
        {errors.content && (
          <p role="alert" className="field-error">
            {t(errors.content.message ?? 'Please check your input.')}
          </p>
        )}
      </div>
      {error && <ErrorState error={error} />}
      <div className="flex justify-end gap-2 border-t pt-5">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          {t('Cancel')}
        </Button>
        <Button disabled={pending}>{pending ? t('Saving\u2026') : t('Save note')}</Button>
      </div>
    </form>
  )
}
