import { createRootRoute, createRoute, createRouter, Outlet, Link } from '@tanstack/react-router'
import { LabPage } from '@/features/lab/lab-page'
const root = createRootRoute({
  component: Outlet,
  notFoundComponent: () => (
    <main className="welcome">
      <h1>Page not found</h1>
      <Link to="/">Return to A2UI Lab</Link>
    </main>
  ),
})
const lab = createRoute({ getParentRoute: () => root, path: '/', component: LabPage })
export const router = createRouter({ routeTree: root.addChildren([lab]) })
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
