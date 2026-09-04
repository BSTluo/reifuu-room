const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

interface ApiSuccessBody<T> {
  status: 'success'
  data: T
}

interface ApiErrorBody {
  status: 'error'
  message: string
}

export class ApiRequestError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.statusCode = statusCode
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  const body = (await response.json().catch(() => null)) as ApiSuccessBody<T> | ApiErrorBody | null

  if (!response.ok || !body || body.status === 'error') {
    const message = body && 'message' in body ? body.message : `请求失败 (${response.status})`
    throw new ApiRequestError(message, response.status)
  }

  return body.data
}

export function apiGet<T>(path: string, token?: string): Promise<T> {
  return request<T>(path, { method: 'GET' }, token)
}

export function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) }, token)
}

export function apiDelete<T>(path: string, token?: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' }, token)
}
