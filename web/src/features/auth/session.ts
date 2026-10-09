import { useQuery } from '@tanstack/react-query'
import { api, APIError, required, setCSRF } from '@/lib/api'
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      try {
        const result = required((await api.GET('/api/auth/me')).data)
        setCSRF(result.csrf_token)
        return result
      } catch (error) {
        if (error instanceof APIError && error.status === 401) {
          setCSRF('')
          return null
        }
        throw error
      }
    },
    retry: false,
    staleTime: 60_000,
  })
}
