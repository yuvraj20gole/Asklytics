const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

export type RegisterPayload = {
  company_email: string
  username: string
  password: string
  full_name?: string
}

export async function register(payload: RegisterPayload) {
  const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<{ message: string; email: string; username: string }>
}

export async function login(email_or_username: string, password: string) {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email_or_username, password }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<{ access_token: string; token_type: string }>
}

export async function ask(question: string, token: string) {
  const res = await fetch(`${API_BASE}/api/v1/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ question }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<{
    question: string
    sql: string
    explanation: string
    rows: Array<Record<string, unknown>>
  }>
}
