// Teste de integração ponta a ponta contra um PostgreSQL real.
// Uso: DATABASE_URL=postgres://... node scripts/smoke-test.mjs  (após `npm run build`)
// O banco informado é usado como base descartável: não aponte para produção.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'server/package.json'))
const XLSX = require('xlsx')
const pg = require('pg')

if (!process.env.DATABASE_URL) { console.error('Defina DATABASE_URL para um banco de teste.'); process.exit(1) }
const PORT = Number(process.env.SMOKE_PORT || 3999)
const BASE = `http://127.0.0.1:${PORT}`
const env = { ...process.env, NODE_ENV: 'test', PORT: String(PORT), MASTER_EMAIL: 'master@smoke.test', MASTER_INITIAL_PASSWORD: 'smoke-master-123', AI_ENABLED: 'false', TRUST_PROXY: 'false' }

async function startServer() {
  const busy = await fetch(`${BASE}/api/health`).then(() => true, () => false)
  if (busy) throw new Error(`A porta ${PORT} já está em uso por outro processo; defina SMOKE_PORT ou encerre-o.`)
  const child = spawn(process.execPath, ['dist/index.js'], { cwd: path.join(root, 'server'), env, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  child.stdout.on('data', d => { log += d })
  child.stderr.on('data', d => { log += d })
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error(`Servidor encerrou no boot:\n${log}`)
    try { if ((await fetch(`${BASE}/api/health`)).ok) return child } catch {}
    await new Promise(r => setTimeout(r, 500))
  }
  child.kill('SIGKILL')
  throw new Error(`Servidor não respondeu:\n${log}`)
}

async function stopServer(child) {
  const exited = new Promise(r => child.once('exit', r))
  child.kill('SIGTERM')
  await exited
}

const json = async (url, init = {}) => {
  const res = await fetch(`${BASE}${url}`, init)
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

function salesWorkbook() {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['data', 'cliente', 'valor', 'forma_pagamento', 'descricao'],
    ['05/09/2026', 'Cliente A', 1000, 'PIX', 'Venda 1'],
    ['10/09/2026', 'Cliente B', 500, 'Boleto', 'Venda 2']
  ]), 'Vendas')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const flags = async () => (await db.query(`SELECT accounting_role,dre_impact,cash_impact FROM transactions t JOIN companies c ON c.id=t.company_id
  WHERE NOT COALESCE(c.is_demo,false) ORDER BY 1,2,3`)).rows

let server = await startServer()
try {
  const login = await json('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: env.MASTER_EMAIL, password: env.MASTER_INITIAL_PASSWORD }) })
  assert.equal(login.status, 200, 'login master')
  const auth = { authorization: `Bearer ${login.body.token}` }

  const form = new FormData()
  form.append('files', new Blob([salesWorkbook()]), `vendas-${Date.now()}.xlsx`)
  const imported = await json('/api/import-v080?type=SALES_REPORT', { method: 'POST', headers: auth, body: form })
  assert.equal(imported.body.results?.[0]?.status, 'IMPORTED', 'importação do relatório de vendas')

  const before = await flags()
  const dashBefore = await json('/api/dashboard?period=2026-09', { headers: auth })
  assert.equal(dashBefore.status, 200)

  await stopServer(server)
  server = await startServer()

  assert.deepEqual(await flags(), before, 'reiniciar o servidor não pode alterar dre_impact/cash_impact')
  const dashAfter = await json('/api/dashboard?period=2026-09', { headers: auth })
  assert.deepEqual(dashAfter.body.summary, dashBefore.body.summary, 'DRE e caixa estáveis entre deploys')

  const demo = await json('/api/demo/session')
  assert.equal(demo.status, 200, 'sessão de demonstração')
  const demoAuth = { authorization: `Bearer ${demo.body.token}`, 'content-type': 'application/json' }
  const globalRule = await json('/api/classification-rules', { method: 'POST', headers: demoAuth, body: JSON.stringify({ pattern: 'FORNECEDOR', category: 'Retirada do sócio', scope: 'GLOBAL' }) })
  assert.equal(globalRule.status, 403, 'demo não cria regra global')
  const wildcard = await json('/api/classification-rules', { method: 'POST', headers: demoAuth, body: JSON.stringify({ pattern: '%', category: 'X' }) })
  assert.equal(wildcard.status, 400, 'curingas são rejeitados')

  const flow = await json('/api/cash-flow-v080', { headers: { authorization: `Bearer ${demo.body.token}` } })
  const dueDates = (flow.body.upcoming || []).map(x => String(x.due_date || '9999').slice(0, 10))
  assert.ok(dueDates.length > 1, 'fluxo de caixa da demo tem próximos movimentos')
  assert.deepEqual(dueDates, [...dueDates].sort(), 'próximos movimentos em ordem cronológica')

  const reset = await json('/api/source-files/reset', { method: 'DELETE', headers: { authorization: `Bearer ${demo.body.token}` } })
  assert.notEqual(reset.status, 500, 'reset não deve falhar com erro interno')

  const jsonHeaders = { ...auth, 'content-type': 'application/json' }
  const bank = await json('/api/company-accounts', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ label: 'Conta teste', institution: 'Banco X' }) })
  assert.equal(bank.status, 200, 'cria conta bancária')
  const edited = await json(`/api/company-accounts/${bank.body.id}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ label: 'Conta renomeada', institution: 'Banco Y' }) })
  assert.equal(edited.body.label, 'Conta renomeada', 'edita conta bancária')
  const crossTenant = await json(`/api/company-accounts/${bank.body.id}`, { method: 'PATCH', headers: demoAuth, body: JSON.stringify({ label: 'Invasão' }) })
  assert.equal(crossTenant.status, 404, 'outra empresa não edita a conta')

  const notFound = await json('/api/rota-inexistente', { headers: auth })
  assert.equal(notFound.status, 404)

  console.log('smoke-test: OK')
} finally {
  await stopServer(server).catch(() => {})
  await db.end()
}
