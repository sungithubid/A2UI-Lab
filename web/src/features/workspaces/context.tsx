import { createContext, useContext } from 'react'
import type { components } from '@/generated/api'
type Workspace = components['schemas']['Workspace']
export const WorkspaceContext = createContext<Workspace | null>(null)
export function useWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('Workspace context is missing')
  return value
}
