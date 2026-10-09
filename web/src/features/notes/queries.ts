import { queryOptions } from '@tanstack/react-query'
import { api, required } from '@/lib/api'
export const notesQuery = (workspaceID: string, page = 1) =>
  queryOptions({
    queryKey: ['notes', workspaceID, page],
    queryFn: async () =>
      required(
        (
          await api.GET('/api/workspaces/{workspaceID}/notes', {
            params: { path: { workspaceID }, query: { page, page_size: 12 } },
          })
        ).data,
      ),
  })
