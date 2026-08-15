import crypto from 'node:crypto'
import { pool } from './db.js'

export type AuthUser = {
  id: string
  email: string
  name: string
  role: string
  status: string
}

const MASTER_EMAIL = (process.env.MASTER_EMAIL || 'thomas.muller@bateriasmoura.com').trim().toLowerCase()
const SESSION_DAYS = Math.max(1, Math.min(90, Number(process.env.SESSION_DAYS || 30)))

function b64(input: Buffer) { return input.toString('base64url') }
function sha256(value: string) { return crypto.createHash('sha256').update(value).digest('hex') }

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64)
  return `scrypt$${b64(salt)}$${b64(hash)}`
}

export function verifyPassword(password: string, stored?: string | null) {
  try {
    if (!stored) return false
    const [kind, saltText, hashText] = stored.split('$')
    if (kind !== 'scrypt' || !saltText || !hashText) return false
    const salt = Buffer.from(saltText, 'base64url')
    const expected = Buffer.from(hashText, 'base64url')
    const actual = crypto.scryptSync(password, salt, expected.length)
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  } catch { return false }
}

export async function ensureMasterUser() {
  if (!pool) return
  const initialPassword = String(process.env.MASTER_INITIAL_PASSWORD || '')
  const existing = await pool.query(`SELECT id,password_hash FROM users WHERE lower(email)=lower($1) LIMIT 1`, [MASTER_EMAIL])
  let userId = existing.rows[0]?.id
  if (!userId) {
    const passwordHash = initialPassword.length >= 8 ? hashPassword(initialPassword) : null
    const created = await pool.query(`INSERT INTO users(email,name,password_hash,role,status)
      VALUES($1,'Thomas Müller',$2,'MASTER','ACTIVE') RETURNING id`, [MASTER_EMAIL, passwordHash])
    userId = created.rows[0].id
  } else {
    await pool.query(`UPDATE users SET role='MASTER',status='ACTIVE',updated_at=now() WHERE id=$1`, [userId])
    if (!existing.rows[0]?.password_hash && initialPassword.length >= 8) {
      await pool.query(`UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1`, [userId, hashPassword(initialPassword)])
    }
  }
  await pool.query(`INSERT INTO user_companies(user_id,company_id,role)
    SELECT $1,id,'MASTER' FROM companies WHERE active=true AND COALESCE(is_demo,false)=false
    ON CONFLICT(user_id,company_id) DO UPDATE SET role='MASTER'`, [userId])
}

export async function linkMasterToCompany(companyId: string) {
  if (!pool || !companyId) return
  const master = await pool.query(`SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1`, [MASTER_EMAIL])
  if (master.rowCount) await pool.query(`INSERT INTO user_companies(user_id,company_id,role) VALUES($1,$2,'MASTER')
    ON CONFLICT(user_id,company_id) DO UPDATE SET role='MASTER'`, [master.rows[0].id, companyId])
}

export async function createSession(userId: string) {
  if (!pool) throw new Error('Banco não configurado')
  const token = crypto.randomBytes(32).toString('base64url')
  const tokenHash = sha256(token)
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000)
  await pool.query(`INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)`, [userId, tokenHash, expiresAt])
  return { token, expiresAt }
}

export async function destroySession(token?: string | null) {
  if (!pool || !token) return
  await pool.query(`DELETE FROM auth_sessions WHERE token_hash=$1`, [sha256(token)])
}

export function bearerToken(req: any) {
  const header = String(req.headers?.authorization || '')
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
}

export async function authenticateRequest(req: any): Promise<AuthUser | null> {
  if (!pool) return null
  const token = bearerToken(req)
  if (!token) return null
  const result = await pool.query(`SELECT u.id,u.email,u.name,u.role,u.status
    FROM auth_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='ACTIVE' LIMIT 1`, [sha256(token)])
  if (!result.rowCount) return null
  await pool.query(`UPDATE auth_sessions SET last_seen_at=now() WHERE token_hash=$1`, [sha256(token)]).catch(()=>{})
  return result.rows[0]
}

export async function userCompanies(user: AuthUser) {
  if (!pool || !user) return []
  if (user.role === 'MASTER') {
    const r = await pool.query(`SELECT c.id,c.name,c.document,c.sector,c.activity,c.active,COALESCE(uc.role,'MASTER') role
      FROM companies c LEFT JOIN user_companies uc ON uc.company_id=c.id AND uc.user_id=$1
      WHERE c.active=true AND COALESCE(c.is_demo,false)=false ORDER BY c.name`, [user.id])
    return r.rows
  }
  const r = await pool.query(`SELECT c.id,c.name,c.document,c.sector,c.activity,c.active,uc.role
    FROM user_companies uc JOIN companies c ON c.id=uc.company_id
    WHERE uc.user_id=$1 AND c.active=true AND COALESCE(c.is_demo,false)=false ORDER BY c.name`, [user.id])
  return r.rows
}

export async function resolveCompanyId(req: any) {
  if (!pool || !req.auth) return null
  const requested = String(req.headers?.['x-company-id'] || '')
  const companies = await userCompanies(req.auth)
  if (!companies.length) return null
  if (requested && companies.some((c:any)=>c.id===requested)) return requested
  return companies[0].id
}

export async function authPayload(user: AuthUser) {
  return { user, companies: await userCompanies(user) }
}

export function masterEmail() { return MASTER_EMAIL }
