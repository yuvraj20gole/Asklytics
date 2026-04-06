const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

/** Thrown for non-OK API responses; use `status === 401` for expired/invalid auth. */
export class HttpApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'HttpApiError'
  }
}

function parseErrorDetail(text: string): string {
  try {
    const j = JSON.parse(text) as { detail?: unknown }
    const d = j.detail
    if (typeof d === 'string') return d
    if (Array.isArray(d))
      return d.map((x: { msg?: string }) => x.msg ?? JSON.stringify(x)).join('; ')
  } catch {
    /* ignore */
  }
  return text.trim() || 'Request failed'
}

async function throwIfNotOk(res: Response): Promise<void> {
  if (res.ok) return
  const text = await res.text()
  const msg = parseErrorDetail(text)
  throw new HttpApiError(msg, res.status)
}

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

export type IngestImageResult = {
  file_type: string
  company: string
  source_file: string
  extracted_items: number
  rows: Array<{ year: number; metric: string; value: number; raw: string; currency?: string | null }>
  source: 'layoutlm' | 'ocr_fallback'
  confidence_summary: { avg_confidence: number; high_confidence_rows: number } | null
  currency?: string | null
}

export async function ingestImage(company: string, file: File, token: string) {
  const form = new FormData()
  form.append('company', company)
  form.append('file', file)
  const res = await fetch(`${API_BASE}/api/v1/ingest/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  await throwIfNotOk(res)
  return res.json() as Promise<IngestImageResult>
}

export type IngestPdfResult = {
  inserted_rows: number
  tables_extracted: number
  detected_currency: string
  company: string
  source_file: string
  rows: Array<{ year: number; metric: string; value: number; raw: string; currency?: string | null }>
}

export async function ingestPdf(company: string, file: File, token: string) {
  const form = new FormData()
  form.append('company', company)
  form.append('file', file)
  const res = await fetch(`${API_BASE}/api/v1/ingest/pdf`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  await throwIfNotOk(res)
  return res.json() as Promise<IngestPdfResult>
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
  await throwIfNotOk(res)
  return res.json() as Promise<{
    question: string
    sql: string
    explanation: string
    rows: Array<Record<string, unknown>>
    visualization_data?: Array<Record<string, unknown>>
  }>
}
