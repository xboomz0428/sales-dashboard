/**
 * auth.ts — 用儀表板的 Supabase 登入身分驗證 Worker 呼叫（不另設共用密碼）
 * 儀表板帶 Authorization: Bearer <Supabase access token>；Worker 問 Supabase 這是誰、角色是什麼。
 */
import { Env, select } from './supabase'

export interface Caller { id: string; email: string; role: string }

export async function requireUser(req: Request, env: Env, roles: string[] = ['admin', 'manager']): Promise<Caller> {
  const h = req.headers.get('Authorization') || ''
  const jwt = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!jwt) throw new HttpError(401, '未登入')
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${jwt}` } })
  if (!r.ok) throw new HttpError(401, '登入已失效，請重新登入儀表板')
  const u: any = await r.json()
  const rows = await select<{ role: string }>(env, 'user_roles', `select=role&id=eq.${u.id}`)
  const role = rows[0]?.role || 'viewer'
  if (!roles.includes(role)) throw new HttpError(403, `需要 ${roles.join('/')} 權限（你是 ${role}）`)
  return { id: u.id, email: u.email, role }
}

export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg) } }
