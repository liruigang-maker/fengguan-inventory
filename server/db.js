import fs from 'node:fs'
import path from 'node:path'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(root, 'data')
const backupDir = path.join(dataDir, 'backups')
const dbPath = process.env.DB_PATH || path.join(dataDir, 'fengguan.db')

fs.mkdirSync(path.dirname(dbPath), { recursive: true })
fs.mkdirSync(backupDir, { recursive: true })

const db = new DatabaseSync(dbPath)
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA busy_timeout = 3000')
db.exec('PRAGMA foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_current INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS platforms (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  variety TEXT NOT NULL,
  spec TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '袋',
  UNIQUE (variety, spec)
);
CREATE TABLE IF NOT EXISTS salespersons (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS payment_methods (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  code TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  province TEXT,
  city TEXT,
  district TEXT,
  town TEXT,
  salesperson_id INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone) WHERE phone IS NOT NULL;
CREATE TABLE IF NOT EXISTS inbounds (
  id INTEGER PRIMARY KEY,
  season_id INTEGER NOT NULL,
  biz_date TEXT NOT NULL,
  platform_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  voided INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS outbounds (
  id INTEGER PRIMARY KEY,
  season_id INTEGER NOT NULL,
  biz_date TEXT NOT NULL,
  customer_id INTEGER,
  customer_code TEXT,
  province TEXT,
  city TEXT,
  district TEXT,
  town TEXT,
  salesperson_id INTEGER,
  salesperson_name TEXT,
  customer_name TEXT,
  phone TEXT,
  order_bags REAL NOT NULL DEFAULT 0,
  received_amount REAL NOT NULL DEFAULT 0,
  payment_method_id INTEGER,
  payment_method_name TEXT,
  product_id INTEGER,
  platform_id INTEGER,
  voided INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`)

function nowIso() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function today() {
  return nowIso().slice(0, 10)
}

function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000
}

function blank(value) {
  const text = value == null ? '' : String(value).trim()
  return text ? text : null
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 32).toString('hex')
  return { salt, hash }
}

function verifyPassword(password, salt, hash) {
  const actual = scryptSync(password, salt, 32)
  const expected = Buffer.from(hash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function tx(fn) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* already closed */ }
    throw error
  }
}

function one(sql, ...args) {
  return db.prepare(sql).get(...args) ?? null
}

function all(sql, ...args) {
  return db.prepare(sql).all(...args)
}

function currentSeason() {
  return one('SELECT id, name FROM seasons WHERE is_current = 1')
}

function seed() {
  if (!one('SELECT id FROM users LIMIT 1')) {
    const { salt, hash } = hashPassword('123456')
    db.prepare('INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)').run('admin', hash, salt)
  }
  if (!one('SELECT id FROM seasons LIMIT 1')) {
    db.prepare('INSERT INTO seasons (name, is_current) VALUES (?, 1)').run('25-26')
  }
  if (!one('SELECT id FROM platforms LIMIT 1')) {
    const insert = db.prepare('INSERT INTO platforms (name, sort_order) VALUES (?, ?)')
    ;['通辽平台', '包头平台', '兰州平台', '土右旗平台'].forEach((name, index) => insert.run(name, index + 1))
  }
}

seed()

function backupDaily() {
  try {
    const dest = path.join(backupDir, `fengguan-${today()}.db`)
    if (fs.existsSync(dest) || process.env.DB_PATH) return
    const destSql = dest.replaceAll('\\', '/').replaceAll("'", "''")
    db.exec(`VACUUM INTO '${destSql}'`)
    const files = fs.readdirSync(backupDir).filter((name) => name.endsWith('.db')).sort()
    for (const name of files.slice(0, Math.max(0, files.length - 30))) {
      fs.rmSync(path.join(backupDir, name), { force: true })
    }
  } catch (error) {
    console.error('备份没有完成：', error.message)
  }
}

backupDaily()

function audit(entityType, entityId, action, before, after) {
  db.prepare('INSERT INTO audit_logs (entity_type, entity_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)').run(
    entityType,
    entityId,
    action,
    JSON.stringify({ before, after }),
    nowIso(),
  )
}

function publicUser(row) {
  return { id: row.id, username: row.username }
}

export function login(username, password) {
  const user = one('SELECT * FROM users WHERE username = ?', String(username || '').trim())
  if (!user || !verifyPassword(String(password || ''), user.salt, user.password_hash)) return null
  const token = randomBytes(24).toString('hex')
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, user.id, nowIso())
  return { token, user: publicUser(user) }
}

export function userFromToken(token) {
  if (!token) return null
  const row = one(`
    SELECT u.id, u.username, s.created_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `, token)
  if (!row) return null
  const created = new Date(row.created_at.replace(' ', 'T'))
  if (Date.now() - created.getTime() > 30 * 24 * 3600 * 1000) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    return null
  }
  return publicUser(row)
}

export function logout(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function changePassword(userId, oldPassword, newPassword) {
  const user = one('SELECT * FROM users WHERE id = ?', userId)
  if (!user || !verifyPassword(String(oldPassword || ''), user.salt, user.password_hash)) {
    return { ok: false, message: '原密码不正确' }
  }
  if (String(newPassword || '').length < 6) return { ok: false, message: '新密码至少 6 位' }
  const { salt, hash } = hashPassword(String(newPassword))
  db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, userId)
  return { ok: true }
}

function ensureNamed(table, name) {
  const value = blank(name)
  if (!value) return null
  db.prepare(`INSERT INTO ${table} (name) VALUES (?) ON CONFLICT(name) DO NOTHING`).run(value)
  return one(`SELECT id, name FROM ${table} WHERE name = ?`, value)
}

function ensureProduct(variety, spec) {
  const varietyName = blank(variety)
  const specName = blank(spec)
  if (!varietyName && !specName) return null
  if (!varietyName || !specName) {
    const error = new Error('品种和规格要一起填')
    error.statusCode = 400
    throw error
  }
  db.prepare("INSERT INTO products (variety, spec, unit) VALUES (?, ?, '袋') ON CONFLICT(variety, spec) DO NOTHING").run(varietyName, specName)
  return one('SELECT id, variety, spec, unit FROM products WHERE variety = ? AND spec = ?', varietyName, specName)
}

function upsertCustomer(input, salespersonId) {
  const phone = blank(input.phone)
  const name = blank(input.customerName) || ''
  if (!phone && !name) return null
  const row = phone
    ? one('SELECT * FROM customers WHERE phone = ?', phone)
    : one('SELECT * FROM customers WHERE phone IS NULL AND name = ?', name)
  if (!row) {
    const info = db.prepare(`
      INSERT INTO customers (code, name, phone, province, city, district, town, salesperson_id)
      VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, phone, blank(input.province), blank(input.city), blank(input.district), blank(input.town), salespersonId)
    const id = Number(info.lastInsertRowid)
    db.prepare('UPDATE customers SET code = ? WHERE id = ?').run(String(id), id)
    return id
  }
  db.prepare(`
    UPDATE customers
    SET name = ?, phone = ?, province = ?, city = ?, district = ?, town = ?, salesperson_id = ?
    WHERE id = ?
  `).run(name || row.name || '', phone, blank(input.province), blank(input.city), blank(input.district), blank(input.town), salespersonId, row.id)
  if (!row.code) db.prepare('UPDATE customers SET code = ? WHERE id = ?').run(String(row.id), row.id)
  return row.id
}

function platformAvailable(productId, platformId, editingId) {
  const season = currentSeason()
  const inboundQty = one(`
    SELECT COALESCE(SUM(quantity), 0) AS qty
    FROM inbounds WHERE voided = 0 AND season_id = ? AND product_id = ? AND platform_id = ?
  `, season.id, productId, platformId).qty
  const outboundQty = one(`
    SELECT COALESCE(SUM(order_bags), 0) AS qty
    FROM outbounds WHERE voided = 0 AND season_id = ? AND product_id = ? AND platform_id = ? AND order_bags > 0
  `, season.id, productId, platformId).qty
  let available = round3(inboundQty - outboundQty)
  if (editingId) {
    const prev = one('SELECT order_bags AS bags, platform_id AS platformId, product_id AS productId, voided FROM outbounds WHERE id = ?', editingId)
    if (prev && !prev.voided && prev.platformId === platformId && prev.productId === productId) {
      available = round3(available + prev.bags)
    }
  }
  return available
}

function outboundSnapshot(id) {
  return one(`
    SELECT o.id, o.biz_date AS bizDate, o.order_bags AS orderBags, o.received_amount AS receivedAmount,
           o.platform_id AS platformId, o.voided, p.variety, p.spec, pl.name AS platformName
    FROM outbounds o
    LEFT JOIN products p ON p.id = o.product_id
    LEFT JOIN platforms pl ON pl.id = o.platform_id
    WHERE o.id = ?
  `, id)
}

function inboundSnapshot(id) {
  return one(`
    SELECT i.id, i.biz_date AS bizDate, i.quantity, i.platform_id AS platformId, i.voided,
           p.variety, p.spec, pl.name AS platformName
    FROM inbounds i
    JOIN products p ON p.id = i.product_id
    JOIN platforms pl ON pl.id = i.platform_id
    WHERE i.id = ?
  `, id)
}

function mapOutbound(row) {
  if (!row) return null
  return {
    id: row.id,
    bizDate: row.bizDate,
    customerCode: row.customerCode || '',
    province: row.province || '',
    city: row.city || '',
    district: row.district || '',
    town: row.town || '',
    salespersonName: row.salespersonName || '',
    customerName: row.customerName || '',
    phone: row.phone || '',
    orderBags: row.orderBags || 0,
    receivedAmount: row.receivedAmount || 0,
    paymentMethodName: row.paymentMethodName || '',
    variety: row.variety || '',
    spec: row.spec || '',
    platformId: row.platformId ?? null,
    platformName: row.platformId ? row.platformName : '零售/其它',
    voided: !!row.voided,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const outboundSelect = `
  SELECT o.id, o.biz_date AS bizDate, o.customer_code AS customerCode, o.province, o.city, o.district, o.town,
         o.salesperson_name AS salespersonName, o.customer_name AS customerName, o.phone,
         o.order_bags AS orderBags, o.received_amount AS receivedAmount,
         o.payment_method_name AS paymentMethodName, o.platform_id AS platformId, pl.name AS platformName,
         p.variety, p.spec, o.voided, o.created_at AS createdAt, o.updated_at AS updatedAt
  FROM outbounds o
  LEFT JOIN products p ON p.id = o.product_id
  LEFT JOIN platforms pl ON pl.id = o.platform_id
`

export function meta() {
  const season = currentSeason()
  const places = {
    provinces: all("SELECT DISTINCT province AS name FROM outbounds WHERE province IS NOT NULL AND province != '' ORDER BY province").map((row) => row.name),
    cities: all("SELECT DISTINCT city AS name FROM outbounds WHERE city IS NOT NULL AND city != '' ORDER BY city").map((row) => row.name),
    districts: all("SELECT DISTINCT district AS name FROM outbounds WHERE district IS NOT NULL AND district != '' ORDER BY district").map((row) => row.name),
    towns: all("SELECT DISTINCT town AS name FROM outbounds WHERE town IS NOT NULL AND town != '' ORDER BY town").map((row) => row.name),
  }
  return {
    season,
    today: today(),
    platforms: all('SELECT id, name FROM platforms ORDER BY sort_order, id'),
    products: all('SELECT id, variety, spec, unit FROM products ORDER BY variety, spec'),
    salespersons: all('SELECT id, name FROM salespersons ORDER BY name'),
    paymentMethods: all('SELECT id, name FROM payment_methods ORDER BY name'),
    places,
  }
}

export function home() {
  const season = currentSeason()
  const day = today()
  const inbound = one('SELECT COALESCE(SUM(quantity), 0) AS qty FROM inbounds WHERE voided = 0 AND season_id = ? AND biz_date = ?', season.id, day)
  const outbound = one('SELECT COALESCE(SUM(order_bags), 0) AS qty FROM outbounds WHERE voided = 0 AND season_id = ? AND biz_date = ?', season.id, day)
  return { bizDate: day, seasonName: season.name, inboundBags: round3(inbound.qty), outboundBags: round3(outbound.qty) }
}

export function lookupCustomer(phone, name) {
  const phoneText = blank(phone)
  const nameText = blank(name)
  const row = phoneText
    ? one(`
      SELECT c.*, s.name AS salespersonName
      FROM customers c LEFT JOIN salespersons s ON s.id = c.salesperson_id
      WHERE c.phone = ?
    `, phoneText)
    : nameText
      ? one(`
        SELECT c.*, s.name AS salespersonName
        FROM customers c LEFT JOIN salespersons s ON s.id = c.salesperson_id
        WHERE c.phone IS NULL AND c.name = ?
      `, nameText)
      : null
  if (!row) return null
  return {
    id: row.id,
    customerCode: row.code || '',
    customerName: row.name || '',
    phone: row.phone || '',
    province: row.province || '',
    city: row.city || '',
    district: row.district || '',
    town: row.town || '',
    salespersonName: row.salespersonName || '',
  }
}

function assertDate(value) {
  const text = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00`).getTime())) {
    const error = new Error('日期不正确')
    error.statusCode = 400
    throw error
  }
  return text
}

function assertNumber(value, label) {
  if (value === '' || value == null) return 0
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) {
    const error = new Error(`${label}不能为负数`)
    error.statusCode = 400
    throw error
  }
  return round3(number)
}

function requirePlatform(platformId) {
  const platform = one('SELECT id, name FROM platforms WHERE id = ?', Number(platformId))
  if (!platform) {
    const error = new Error('请选择平台')
    error.statusCode = 400
    throw error
  }
  return platform
}

export function createInbound(input) {
  return tx(() => {
    const season = currentSeason()
    const bizDate = assertDate(input.bizDate)
    const platform = requirePlatform(input.platformId)
    const product = ensureProduct(input.variety, input.spec)
    const quantity = assertNumber(input.quantity, '数量')
    if (quantity <= 0) {
      const error = new Error('入库数量要大于 0')
      error.statusCode = 400
      throw error
    }
    const stamp = nowIso()
    const info = db.prepare(`
      INSERT INTO inbounds (season_id, biz_date, platform_id, product_id, quantity, voided, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(season.id, bizDate, platform.id, product.id, quantity, stamp, stamp)
    return getInbound(Number(info.lastInsertRowid))
  })
}

export function updateInbound(id, input) {
  return tx(() => {
    const before = inboundSnapshot(id)
    if (!before) return null
    const bizDate = assertDate(input.bizDate)
    const platform = requirePlatform(input.platformId)
    const product = ensureProduct(input.variety, input.spec)
    const quantity = assertNumber(input.quantity, '数量')
    if (quantity <= 0) {
      const error = new Error('入库数量要大于 0')
      error.statusCode = 400
      throw error
    }
    db.prepare(`
      UPDATE inbounds SET biz_date = ?, platform_id = ?, product_id = ?, quantity = ?, updated_at = ? WHERE id = ?
    `).run(bizDate, platform.id, product.id, quantity, nowIso(), id)
    const after = inboundSnapshot(id)
    audit('inbound', id, 'update', before, after)
    return getInbound(id)
  })
}

export function setInboundVoid(id, voided) {
  return tx(() => {
    const before = inboundSnapshot(id)
    if (!before) return null
    db.prepare('UPDATE inbounds SET voided = ?, updated_at = ? WHERE id = ?').run(voided ? 1 : 0, nowIso(), id)
    audit('inbound', id, voided ? 'void' : 'restore', before, inboundSnapshot(id))
    return getInbound(id)
  })
}

export function getInbound(id) {
  const row = one(`
    SELECT i.id, i.biz_date AS bizDate, i.platform_id AS platformId, pl.name AS platformName,
           i.product_id AS productId, p.variety, p.spec, i.quantity, i.voided,
           i.created_at AS createdAt, i.updated_at AS updatedAt
    FROM inbounds i
    JOIN products p ON p.id = i.product_id
    JOIN platforms pl ON pl.id = i.platform_id
    WHERE i.id = ?
  `, id)
  if (!row) return null
  return { ...row, voided: !!row.voided, quantity: round3(row.quantity) }
}

export function listInbounds(query) {
  const season = currentSeason()
  const where = ['i.season_id = ?']
  const args = [season.id]
  if (!flag(query.includeVoided)) where.push('i.voided = 0')
  if (query.dateFrom) { where.push('i.biz_date >= ?'); args.push(query.dateFrom) }
  if (query.dateTo) { where.push('i.biz_date <= ?'); args.push(query.dateTo) }
  if (query.platformId) { where.push('i.platform_id = ?'); args.push(Number(query.platformId)) }
  if (query.variety) { where.push("p.variety LIKE ? ESCAPE '\\'"); args.push(like(query.variety)) }
  if (query.spec) { where.push("p.spec LIKE ? ESCAPE '\\'"); args.push(like(query.spec)) }
  const rows = all(`
    SELECT i.id, i.biz_date AS bizDate, i.platform_id AS platformId, pl.name AS platformName,
           p.variety, p.spec, i.quantity, i.voided
    FROM inbounds i
    JOIN products p ON p.id = i.product_id
    JOIN platforms pl ON pl.id = i.platform_id
    WHERE ${where.join(' AND ')}
    ORDER BY i.biz_date DESC, i.id DESC
  `, ...args)
  return rows.map((row) => ({ ...row, voided: !!row.voided, quantity: round3(row.quantity) }))
}

function saveOutbound(id, input) {
  const season = currentSeason()
  const bizDate = assertDate(input.bizDate)
  const orderBags = assertNumber(input.orderBags, '订货袋数')
  const receivedAmount = assertNumber(input.receivedAmount, '回款')
  if (orderBags <= 0 && receivedAmount <= 0) {
    const error = new Error('订货袋数和回款至少填一个')
    error.statusCode = 400
    throw error
  }
  const product = orderBags > 0 || blank(input.variety) || blank(input.spec) ? ensureProduct(input.variety, input.spec) : null
  if (orderBags > 0 && !product) {
    const error = new Error('有出库数量时要填写品种和规格')
    error.statusCode = 400
    throw error
  }
  if (input.platformId == null || input.platformId === '' || input.platformId === 'retail') {
    const error = new Error('先选库房')
    error.statusCode = 400
    throw error
  }
  const platform = requirePlatform(input.platformId)
  const platformId = platform.id
  if (orderBags > 0) {
    const available = platformAvailable(product.id, platformId, id)
    if (orderBags > available) {
      const error = new Error(`${platform.name.replace(/平台$/, '')}不够出，这个规格现在还有 ${available} 袋`)
      error.statusCode = 400
      throw error
    }
  }
  const salesperson = ensureNamed('salespersons', input.salespersonName)
  const payment = ensureNamed('payment_methods', input.paymentMethodName)
  const customerId = upsertCustomer(input, salesperson?.id ?? null)
  const stamp = nowIso()
  const values = [
    bizDate,
    customerId,
    customerId ? String(customerId) : null,
    blank(input.province),
    blank(input.city),
    blank(input.district),
    blank(input.town),
    salesperson?.id ?? null,
    salesperson?.name ?? null,
    blank(input.customerName),
    blank(input.phone),
    orderBags,
    receivedAmount,
    payment?.id ?? null,
    payment?.name ?? null,
    product?.id ?? null,
    platformId,
    stamp,
  ]
  if (!id) {
    const info = db.prepare(`
      INSERT INTO outbounds (
        season_id, biz_date, customer_id, customer_code, province, city, district, town,
        salesperson_id, salesperson_name, customer_name, phone, order_bags, received_amount,
        payment_method_id, payment_method_name, product_id, platform_id, voided, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(season.id, ...values, stamp)
    return Number(info.lastInsertRowid)
  }
  db.prepare(`
    UPDATE outbounds SET
      biz_date = ?, customer_id = ?, customer_code = ?, province = ?, city = ?, district = ?, town = ?,
      salesperson_id = ?, salesperson_name = ?, customer_name = ?, phone = ?, order_bags = ?, received_amount = ?,
      payment_method_id = ?, payment_method_name = ?, product_id = ?, platform_id = ?, updated_at = ?
    WHERE id = ?
  `).run(...values, id)
  return id
}

export function createOutbound(input) {
  return tx(() => getOutbound(saveOutbound(null, input)))
}

export function updateOutbound(id, input) {
  return tx(() => {
    const before = outboundSnapshot(id)
    if (!before) return null
    saveOutbound(id, input)
    audit('outbound', id, 'update', before, outboundSnapshot(id))
    return getOutbound(id)
  })
}

export function setOutboundVoid(id, voided) {
  return tx(() => {
    const before = outboundSnapshot(id)
    if (!before) return null
    db.prepare('UPDATE outbounds SET voided = ?, updated_at = ? WHERE id = ?').run(voided ? 1 : 0, nowIso(), id)
    audit('outbound', id, voided ? 'void' : 'restore', before, outboundSnapshot(id))
    return getOutbound(id)
  })
}

export function getOutbound(id) {
  return mapOutbound(one(`${outboundSelect} WHERE o.id = ?`, id))
}

function like(value) {
  return `%${String(value).replace(/[\\%_]/g, '\\$&')}%`
}

function flag(value) {
  return value === true || value === '1' || value === 'true'
}

export function listOutbounds(query) {
  const season = currentSeason()
  const where = ['o.season_id = ?']
  const args = [season.id]
  if (!flag(query.includeVoided)) where.push('o.voided = 0')
  if (query.dateFrom) { where.push('o.biz_date >= ?'); args.push(query.dateFrom) }
  if (query.dateTo) { where.push('o.biz_date <= ?'); args.push(query.dateTo) }
  if (query.customer) { where.push("o.customer_name LIKE ? ESCAPE '\\'"); args.push(like(query.customer)) }
  if (query.phone) { where.push("o.phone LIKE ? ESCAPE '\\'"); args.push(like(query.phone)) }
  if (query.variety) { where.push("p.variety LIKE ? ESCAPE '\\'"); args.push(like(query.variety)) }
  if (query.spec) { where.push("p.spec LIKE ? ESCAPE '\\'"); args.push(like(query.spec)) }
  if (query.salesperson) { where.push("o.salesperson_name LIKE ? ESCAPE '\\'"); args.push(like(query.salesperson)) }
  if (query.province) { where.push("o.province LIKE ? ESCAPE '\\'"); args.push(like(query.province)) }
  if (query.city) { where.push("o.city LIKE ? ESCAPE '\\'"); args.push(like(query.city)) }
  if (query.district) { where.push("o.district LIKE ? ESCAPE '\\'"); args.push(like(query.district)) }
  if (query.platform === 'retail') where.push('o.platform_id IS NULL')
  else if (query.platformId) { where.push('o.platform_id = ?'); args.push(Number(query.platformId)) }
  return all(`
    ${outboundSelect}
    WHERE ${where.join(' AND ')}
    ORDER BY o.biz_date DESC, o.id DESC
  `, ...args).map(mapOutbound)
}

export function inventory(variety) {
  const season = currentSeason()
  const platforms = all('SELECT id, name FROM platforms ORDER BY sort_order, id')
  const ins = all(`
    SELECT product_id, platform_id, SUM(quantity) AS qty
    FROM inbounds WHERE voided = 0 AND season_id = ?
    GROUP BY product_id, platform_id
  `, season.id)
  const outs = all(`
    SELECT product_id, platform_id, SUM(order_bags) AS qty
    FROM outbounds WHERE voided = 0 AND season_id = ? AND order_bags > 0 AND product_id IS NOT NULL
    GROUP BY product_id, platform_id
  `, season.id)
  const inMap = new Map(ins.map((row) => [`${row.product_id}:${row.platform_id}`, row.qty]))
  const outMap = new Map(outs.map((row) => [`${row.product_id}:${row.platform_id == null ? 'retail' : row.platform_id}`, row.qty]))
  const productIds = new Set([...ins.map((row) => row.product_id), ...outs.map((row) => row.product_id)])
  const rows = []
  for (const productId of productIds) {
    const product = one('SELECT id, variety, spec FROM products WHERE id = ?', productId)
    if (!product) continue
    if (variety && !product.variety.includes(String(variety).trim())) continue
    const platformQty = {}
    let inboundSum = 0
    let outboundSum = 0
    for (const platform of platforms) {
      const inboundQty = inMap.get(`${productId}:${platform.id}`) || 0
      const outboundQty = outMap.get(`${productId}:${platform.id}`) || 0
      platformQty[platform.id] = round3(inboundQty - outboundQty)
      inboundSum += inboundQty
      outboundSum += outboundQty
    }
    const retailOut = round3(outMap.get(`${productId}:retail`) || 0)
    outboundSum += retailOut
    rows.push({
      productId: product.id,
      variety: product.variety,
      spec: product.spec,
      platformQty,
      retailOut,
      total: round3(inboundSum - outboundSum),
    })
  }
  rows.sort((a, b) => a.variety.localeCompare(b.variety, 'zh') || a.spec.localeCompare(b.spec, 'zh'))
  return { platforms, rows }
}

export function inventoryDetail(query) {
  const season = currentSeason()
  const productId = Number(query.productId)
  const product = one('SELECT id, variety, spec FROM products WHERE id = ?', productId)
  if (!product) return null
  const inboundWhere = ['i.voided = 0', 'i.season_id = ?', 'i.product_id = ?']
  const outboundWhere = ['o.voided = 0', 'o.season_id = ?', 'o.product_id = ?', 'o.order_bags > 0']
  const inboundArgs = [season.id, productId]
  const outboundArgs = [season.id, productId]
  let title = `${product.variety} ${product.spec}`
  if (query.scope === 'platform') {
    const platform = requirePlatform(query.platformId)
    inboundWhere.push('i.platform_id = ?')
    outboundWhere.push('o.platform_id = ?')
    inboundArgs.push(platform.id)
    outboundArgs.push(platform.id)
    title += ` · ${platform.name}`
  } else if (query.scope === 'retail') {
    outboundWhere.push('o.platform_id IS NULL')
    title += ' · 零售/其它'
  } else {
    title += ' · 全部'
  }
  const inbounds = query.scope === 'retail' ? [] : all(`
    SELECT i.id, i.biz_date AS bizDate, pl.name AS platformName, i.quantity
    FROM inbounds i JOIN platforms pl ON pl.id = i.platform_id
    WHERE ${inboundWhere.join(' AND ')}
    ORDER BY i.biz_date DESC, i.id DESC
  `, ...inboundArgs)
  const outbounds = all(`
    SELECT o.id, o.biz_date AS bizDate, o.customer_name AS customerName, o.order_bags AS orderBags,
           CASE WHEN o.platform_id IS NULL THEN '零售/其它' ELSE pl.name END AS platformName
    FROM outbounds o LEFT JOIN platforms pl ON pl.id = o.platform_id
    WHERE ${outboundWhere.join(' AND ')}
    ORDER BY o.biz_date DESC, o.id DESC
  `, ...outboundArgs)
  return { title, inbounds, outbounds }
}

export function outboundStats(query) {
  const rows = listOutbounds({ ...query, includeVoided: false }).filter((row) => row.orderBags > 0)
  const platforms = all('SELECT id, name FROM platforms ORDER BY sort_order, id')
  const breakdown = platforms.map((platform) => ({
    key: String(platform.id),
    name: platform.name,
    bags: round3(rows.filter((row) => row.platformId === platform.id).reduce((sum, row) => sum + row.orderBags, 0)),
  }))
  breakdown.push({
    key: 'retail',
    name: '零售/其它',
    bags: round3(rows.filter((row) => row.platformId == null).reduce((sum, row) => sum + row.orderBags, 0)),
  })
  return {
    totalBags: round3(rows.reduce((sum, row) => sum + row.orderBags, 0)),
    breakdown,
    rows,
  }
}

export function paymentStats(query) {
  const rows = listOutbounds({ ...query, includeVoided: false }).filter((row) => row.receivedAmount > 0)
  return {
    totalAmount: round3(rows.reduce((sum, row) => sum + row.receivedAmount, 0)),
    rows,
  }
}

export function clearBusinessData(userId, password) {
  const user = one('SELECT * FROM users WHERE id = ?', userId)
  if (!user || !verifyPassword(String(password || ''), user.salt, user.password_hash)) {
    const error = new Error('密码不正确')
    error.statusCode = 400
    throw error
  }
  tx(() => {
    db.exec(`
      DELETE FROM audit_logs;
      DELETE FROM inbounds;
      DELETE FROM outbounds;
      DELETE FROM customers;
      DELETE FROM products;
      DELETE FROM salespersons;
      DELETE FROM payment_methods;
    `)
  })
  if (!process.env.DB_PATH) {
    for (const name of fs.readdirSync(backupDir)) {
      if (name.endsWith('.db')) fs.rmSync(path.join(backupDir, name), { force: true })
    }
  }
  return { ok: true }
}

function platformKey(name) {
  return String(name || '').trim().replace(/平台$/, '')
}

export function createSalesperson(name) {
  const row = ensureNamed('salespersons', name)
  if (!row) {
    const error = new Error('业务员姓名不能为空')
    error.statusCode = 400
    throw error
  }
  return row
}

export function createPlatform(name) {
  const value = blank(name)
  if (!value) {
    const error = new Error('库房名称不能为空')
    error.statusCode = 400
    throw error
  }
  const key = platformKey(value)
  const duplicated = all('SELECT id, name FROM platforms').some((item) => platformKey(item.name) === key)
  if (duplicated) {
    const error = new Error('已经有这个库房')
    error.statusCode = 400
    throw error
  }
  const sort = one('SELECT COALESCE(MAX(sort_order), 0) AS n FROM platforms').n + 1
  const info = db.prepare('INSERT INTO platforms (name, sort_order) VALUES (?, ?)').run(value, sort)
  return one('SELECT id, name FROM platforms WHERE id = ?', info.lastInsertRowid)
}

export function deletePlatform(id) {
  const platform = one('SELECT id, name FROM platforms WHERE id = ?', Number(id))
  if (!platform) return null
  const used = usedCount('SELECT COUNT(*) AS c FROM inbounds WHERE platform_id = ?', platform.id)
    + usedCount('SELECT COUNT(*) AS c FROM outbounds WHERE platform_id = ?', platform.id)
  if (used) {
    const error = new Error('这个库还有入库或出库，不能删除')
    error.statusCode = 400
    throw error
  }
  db.prepare('DELETE FROM platforms WHERE id = ?').run(platform.id)
  return { ok: true }
}

export function renamePlatform(id, name) {
  const value = blank(name)
  if (!value) {
    const error = new Error('平台名称不能为空')
    error.statusCode = 400
    throw error
  }
  const duplicated = one('SELECT id FROM platforms WHERE name = ? AND id != ?', value, id)
  if (duplicated) {
    const error = new Error('已经有这个平台名称')
    error.statusCode = 400
    throw error
  }
  const info = db.prepare('UPDATE platforms SET name = ? WHERE id = ?').run(value, id)
  if (!info.changes) return null
  return one('SELECT id, name FROM platforms WHERE id = ?', id)
}

function usedCount(sql, id) {
  return one(sql, id).c
}

export function deleteProduct(id) {
  const used = usedCount('SELECT COUNT(*) AS c FROM inbounds WHERE product_id = ?', id)
    + usedCount('SELECT COUNT(*) AS c FROM outbounds WHERE product_id = ?', id)
  if (used) {
    const error = new Error('这个品种规格已经有账，不能删除')
    error.statusCode = 400
    throw error
  }
  const info = db.prepare('DELETE FROM products WHERE id = ?').run(id)
  return info.changes > 0
}

export function deleteSalesperson(id) {
  const used = usedCount('SELECT COUNT(*) AS c FROM outbounds WHERE salesperson_id = ?', id)
    + usedCount('SELECT COUNT(*) AS c FROM customers WHERE salesperson_id = ?', id)
  if (used) {
    const error = new Error('这个业务员已经有账，不能删除')
    error.statusCode = 400
    throw error
  }
  return db.prepare('DELETE FROM salespersons WHERE id = ?').run(id).changes > 0
}

export function deletePaymentMethod(id) {
  const used = usedCount('SELECT COUNT(*) AS c FROM outbounds WHERE payment_method_id = ?', id)
  if (used) {
    const error = new Error('这个付款方式已经有账，不能删除')
    error.statusCode = 400
    throw error
  }
  return db.prepare('DELETE FROM payment_methods WHERE id = ?').run(id).changes > 0
}

export function listCustomers(keyword) {
  const where = []
  const args = []
  if (keyword) {
    where.push("(c.name LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\' OR IFNULL(c.code, '') LIKE ? ESCAPE '\\')")
    args.push(like(keyword), like(keyword), like(keyword))
  }
  return all(`
    SELECT c.id, c.code, c.name, c.phone, c.province, c.city, c.district, c.town, s.name AS salespersonName
    FROM customers c LEFT JOIN salespersons s ON s.id = c.salesperson_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY c.name
  `, ...args).map((row) => ({
    id: row.id,
    customerCode: row.code || '',
    customerName: row.name || '',
    phone: row.phone || '',
    province: row.province || '',
    city: row.city || '',
    district: row.district || '',
    town: row.town || '',
    salespersonName: row.salespersonName || '',
  }))
}

export function updateCustomer(id, input) {
  const current = one('SELECT * FROM customers WHERE id = ?', id)
  if (!current) return null
  const phone = blank(input.phone)
  const name = blank(input.customerName)
  if (!name) {
    const error = new Error('客户名称不能为空')
    error.statusCode = 400
    throw error
  }
  if (phone) {
    const duplicated = one('SELECT id FROM customers WHERE phone = ? AND id != ?', phone, id)
    if (duplicated) {
      const error = new Error('这个电话已经有客户')
      error.statusCode = 400
      throw error
    }
  }
  const salesperson = ensureNamed('salespersons', input.salespersonName)
  db.prepare(`
    UPDATE customers
    SET code = ?, name = ?, phone = ?, province = ?, city = ?, district = ?, town = ?, salesperson_id = ?
    WHERE id = ?
  `).run(blank(input.customerCode), name, phone, blank(input.province), blank(input.city), blank(input.district), blank(input.town), salesperson?.id ?? null, id)
  return listCustomers('').find((row) => row.id === id) || null
}

export function close() {
  db.close()
}

export { today }
