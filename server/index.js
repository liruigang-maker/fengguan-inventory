import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import * as db from './db.js'
import { inboundsWorkbook, outboundsWorkbook } from './export.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const port = Number(process.env.PORT || 3000)

const app = Fastify({ logger: false })
await app.register(cookie)

function fail(reply, error) {
  const status = error.statusCode || 500
  if (status >= 500) console.error(error)
  return reply.code(status).send({ message: status >= 500 ? '服务器出错了' : error.message })
}

app.addHook('onRequest', async (request, reply) => {
  const url = request.url.split('?')[0]
  if (!url.startsWith('/api') || url === '/api/login' || url === '/api/health') return
  const user = db.userFromToken(request.cookies?.sid)
  if (!user) return reply.code(401).send({ message: '请先登录' })
  request.user = user
})

app.get('/api/health', async () => ({ ok: true }))

app.post('/api/login', async (request, reply) => {
  const { username, password } = request.body || {}
  const result = db.login(username, password)
  if (!result) return reply.code(400).send({ message: '账号或密码不正确' })
  reply.setCookie('sid', result.token, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 })
  return { user: result.user }
})

app.post('/api/logout', async (request, reply) => {
  db.logout(request.cookies?.sid)
  reply.clearCookie('sid', { path: '/' })
  return { ok: true }
})

app.get('/api/me', async (request) => ({ user: request.user }))

app.post('/api/password', async (request, reply) => {
  const result = db.changePassword(request.user.id, request.body?.oldPassword, request.body?.newPassword)
  if (!result.ok) return reply.code(400).send({ message: result.message })
  return { ok: true }
})

app.post('/api/data/clear', async (request, reply) => {
  try {
    return db.clearBusinessData(request.user.id, request.body?.password)
  } catch (error) {
    return fail(reply, error)
  }
})

app.get('/api/meta', async () => db.meta())
app.get('/api/home', async () => db.home())

app.get('/api/customers/lookup', async (request) => {
  return { customer: db.lookupCustomer(request.query.phone, request.query.name) }
})

app.get('/api/customers', async (request) => db.listCustomers(request.query.q || ''))

app.patch('/api/customers/:id', async (request, reply) => {
  try {
    const row = db.updateCustomer(Number(request.params.id), request.body || {})
    if (!row) return reply.code(404).send({ message: '没有这笔客户' })
    return row
  } catch (error) {
    return fail(reply, error)
  }
})

app.get('/api/inbounds', async (request) => db.listInbounds(request.query))
app.get('/api/inbounds/:id', async (request, reply) => {
  const row = db.getInbound(Number(request.params.id))
  if (!row) return reply.code(404).send({ message: '没有这笔入库' })
  return row
})
app.post('/api/inbounds', async (request, reply) => {
  try {
    return db.createInbound(request.body || {})
  } catch (error) {
    return fail(reply, error)
  }
})
app.patch('/api/inbounds/:id', async (request, reply) => {
  try {
    const row = db.updateInbound(Number(request.params.id), request.body || {})
    if (!row) return reply.code(404).send({ message: '没有这笔入库' })
    return row
  } catch (error) {
    return fail(reply, error)
  }
})
app.post('/api/inbounds/:id/void', async (request, reply) => {
  const row = db.setInboundVoid(Number(request.params.id), true)
  if (!row) return reply.code(404).send({ message: '没有这笔入库' })
  return row
})
app.post('/api/inbounds/:id/restore', async (request, reply) => {
  const row = db.setInboundVoid(Number(request.params.id), false)
  if (!row) return reply.code(404).send({ message: '没有这笔入库' })
  return row
})

app.get('/api/outbounds', async (request) => db.listOutbounds(request.query))
app.get('/api/outbounds/:id', async (request, reply) => {
  const row = db.getOutbound(Number(request.params.id))
  if (!row) return reply.code(404).send({ message: '没有这笔出库' })
  return row
})
app.post('/api/outbounds', async (request, reply) => {
  try {
    return db.createOutbound(request.body || {})
  } catch (error) {
    return fail(reply, error)
  }
})
app.patch('/api/outbounds/:id', async (request, reply) => {
  try {
    const row = db.updateOutbound(Number(request.params.id), request.body || {})
    if (!row) return reply.code(404).send({ message: '没有这笔出库' })
    return row
  } catch (error) {
    return fail(reply, error)
  }
})
app.post('/api/outbounds/:id/void', async (request, reply) => {
  const row = db.setOutboundVoid(Number(request.params.id), true)
  if (!row) return reply.code(404).send({ message: '没有这笔出库' })
  return row
})
app.post('/api/outbounds/:id/restore', async (request, reply) => {
  const row = db.setOutboundVoid(Number(request.params.id), false)
  if (!row) return reply.code(404).send({ message: '没有这笔出库' })
  return row
})

app.get('/api/inventory', async (request) => db.inventory(request.query.variety || ''))
app.get('/api/inventory/detail', async (request, reply) => {
  try {
    const detail = db.inventoryDetail(request.query)
    if (!detail) return reply.code(404).send({ message: '没有这个品种' })
    return detail
  } catch (error) {
    return fail(reply, error)
  }
})
app.get('/api/stats/outbound', async (request) => db.outboundStats(request.query))
app.get('/api/stats/payments', async (request) => db.paymentStats(request.query))

app.get('/api/export/inbounds', async (request, reply) => {
  const rows = db.listInbounds({ ...request.query, includeVoided: false })
  const buffer = await inboundsWorkbook(rows)
  const filename = `25-26丰冠农业入库明细_${db.today().replaceAll('-', '')}.xlsx`
  reply
    .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    .send(buffer)
})

app.get('/api/export/outbounds', async (request, reply) => {
  const rows = db.listOutbounds({ ...request.query, includeVoided: false })
  const buffer = await outboundsWorkbook(rows)
  const filename = `25-26丰冠农业出库明细_${db.today().replaceAll('-', '')}.xlsx`
  reply
    .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    .send(buffer)
})

app.post('/api/platforms', async (request, reply) => {
  try {
    return db.createPlatform(request.body?.name)
  } catch (error) {
    return fail(reply, error)
  }
})
app.delete('/api/platforms/:id', async (request, reply) => {
  try {
    const row = db.deletePlatform(Number(request.params.id))
    if (!row) return reply.code(404).send({ message: '没有这个库房' })
    return row
  } catch (error) {
    return fail(reply, error)
  }
})
app.patch('/api/platforms/:id', async (request, reply) => {
  try {
    const row = db.renamePlatform(Number(request.params.id), request.body?.name)
    if (!row) return reply.code(404).send({ message: '没有这个平台' })
    return row
  } catch (error) {
    return fail(reply, error)
  }
})
app.delete('/api/products/:id', async (request, reply) => {
  try {
    if (!db.deleteProduct(Number(request.params.id))) return reply.code(404).send({ message: '没有这个品种' })
    return { ok: true }
  } catch (error) {
    return fail(reply, error)
  }
})
app.post('/api/salespersons', async (request, reply) => {
  try {
    return db.createSalesperson(request.body?.name)
  } catch (error) {
    return fail(reply, error)
  }
})
app.delete('/api/salespersons/:id', async (request, reply) => {
  try {
    if (!db.deleteSalesperson(Number(request.params.id))) return reply.code(404).send({ message: '没有这个业务员' })
    return { ok: true }
  } catch (error) {
    return fail(reply, error)
  }
})
app.delete('/api/payment-methods/:id', async (request, reply) => {
  try {
    if (!db.deletePaymentMethod(Number(request.params.id))) return reply.code(404).send({ message: '没有这个付款方式' })
    return { ok: true }
  } catch (error) {
    return fail(reply, error)
  }
})

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.get('/*', async (request, reply) => {
    const urlPath = decodeURIComponent(request.url.split('?')[0])
    const relative = urlPath.replace(/^\/+/, '')
    const filePath = path.normalize(path.join(dist, relative))
    const rootWithSep = dist.endsWith(path.sep) ? dist : dist + path.sep
    if (relative && filePath.startsWith(rootWithSep) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return reply.type(contentTypes[path.extname(filePath)] || 'application/octet-stream').send(fs.readFileSync(filePath))
    }
    return reply.type('text/html; charset=utf-8').send(fs.readFileSync(path.join(dist, 'index.html')))
  })
}

await app.listen({ port, host: '0.0.0.0' })
console.log(`丰冠记账已启动：http://localhost:${port}`)
