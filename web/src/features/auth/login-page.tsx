import { LanguageSwitch } from '@/components/language-switch'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate } from '@tanstack/react-router'
import { ArrowRight, Sprout } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ErrorState, Loading } from '@/components/states'
import { api, required, setCSRF } from '@/lib/api'
import { useSession } from './session'

export function LoginPage() {
  const { t } = useTranslation()
  const schema = z.object({
    email: z.email('Enter a valid email address'),
    password: z.string().min(1, 'Enter your password'),
  })
  const session = useSession()
  const client = useQueryClient()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })
  const login = useMutation({
    mutationFn: async (body: z.infer<typeof schema>) =>
      required((await api.POST('/api/auth/login', { body })).data),
    onSuccess: (data) => {
      setCSRF(data.csrf_token)
      client.clear()
      client.setQueryData(['session'], data)
    },
  })
  if (session.isPending) return <Loading />
  if (session.data) return <Navigate to="/" />
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-[#183d35] p-14 text-white lg:flex">
        <div className="flex items-center gap-3 text-xl font-semibold">
          <Sprout />
          monoseed
        </div>
        <div>
          <div className="mb-6 text-sm uppercase tracking-[.22em] text-emerald-200">
            {t('A little space. Big possibilities.')}
          </div>
          <h1 className="max-w-lg text-6xl font-medium leading-[1.12] tracking-tight">
            {t('Make room')}
            <br />
            {t('for your next idea.')}
          </h1>
          <p className="mt-8 max-w-sm text-lg leading-8 text-emerald-100/70">
            {t("Your team's thoughts, plans, and everyday work. Together in one calm workspace.")}
          </p>
        </div>
        <div className="text-xs text-emerald-100/60">{t('A place to start. A place to grow.')}</div>
      </div>
      <main className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex justify-end">
            <LanguageSwitch />
          </div>
          <Sprout className="mb-8 size-9 text-primary" />
          <h2 className="text-3xl font-semibold tracking-tight">{t('Welcome back')}</h2>
          <p className="mb-8 mt-3 text-muted-foreground">
            {t('Sign in to your Monoseed workspace.')}
          </p>
          <form className="space-y-5" onSubmit={handleSubmit((values) => login.mutate(values))}>
            <div>
              <label htmlFor="email">{t('Email address')}</label>
              <Input
                id="email"
                autoComplete="username"
                type="email"
                placeholder="you@company.com"
                {...register('email')}
              />
              {errors.email && (
                <p className="field-error">
                  {t(errors.email.message ?? 'Please check your input.')}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="password">{t('Password')}</label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password && (
                <p className="field-error">
                  {t(errors.password.message ?? 'Please check your input.')}
                </p>
              )}
            </div>
            {(login.error || session.error) && (
              <ErrorState error={(login.error || session.error)!} />
            )}
            <Button className="w-full" disabled={login.isPending}>
              {login.isPending ? t('Signing in\u2026') : t('Sign in')}
              <ArrowRight />
            </Button>
          </form>
          <p className="mt-8 text-center text-xs leading-6 text-muted-foreground">
            {t('An invitation-only space.')}
            <br />
            {t('Contact your administrator if you need access.')}
          </p>
        </div>
      </main>
    </div>
  )
}
