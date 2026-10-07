export class ApiError extends Error {
  readonly status: number

  constructor(status: number, statusText: string) {
    super(`API request failed: ${status} ${statusText}`)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const baseUrl = import.meta.env.VITE_API_URL?.trim()
  if (!baseUrl) {
    throw new Error('VITE_API_URL is required')
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
  const response = await fetch(url, options)
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText)
  }

  if (response.status === 204) return undefined as T

  return response.json() as Promise<T>
}
