import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Link,
  Outlet,
} from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AppLayout } from './layout'
const root = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFound,
})
const login = createRoute({
  getParentRoute: () => root,
  path: '/login',
  component: lazyRouteComponent(() => import('@/features/auth/login-page'), 'LoginPage'),
})
const authenticated = createRoute({
  getParentRoute: () => root,
  id: 'authenticated',
  component: AppLayout,
})
const dashboard = createRoute({
  getParentRoute: () => authenticated,
  path: '/',
  component: lazyRouteComponent(
    () => import('@/features/dashboard/dashboard-page'),
    'DashboardPage',
  ),
})
const notes = createRoute({
  getParentRoute: () => authenticated,
  path: '/notes',
  component: lazyRouteComponent(() => import('@/features/notes/notes-page'), 'NotesPage'),
})
const account = createRoute({
  getParentRoute: () => authenticated,
  path: '/account',
  component: lazyRouteComponent(() => import('@/features/account/account-page'), 'AccountPage'),
})
export const router = createRouter({
  routeTree: root.addChildren([login, authenticated.addChildren([dashboard, notes, account])]),
})
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function NotFound() {
  const { t } = useTranslation()
  return (
    <main className="mx-auto max-w-xl p-12">
      <p className="eyebrow">404</p>
      <h1>{t("This page hasn't taken root.")}</h1>
      <p className="my-5 text-muted-foreground">
        {t("The page you're looking for could not be found.")}
      </p>
      <Link to="/" className="text-primary underline">
        {t('Back to your workspace')}
      </Link>
    </main>
  )
}
