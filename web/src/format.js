function isoDate(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function today() {
  return isoDate(new Date())
}

export function yearsAgo(years) {
  const date = new Date()
  date.setFullYear(date.getFullYear() - years)
  return isoDate(date)
}

export function cnDate(iso) {
  const [year, month, day] = String(iso || '').split('-')
  if (!year || !month || !day) return ''
  return `${Number(year)}年${Number(month)}月${Number(day)}日`
}

export function specLabel(name) {
  const text = String(name || '')
  return /^\d+(\.\d+)?$/.test(text) ? `${text}粒` : text
}

export function markOf(text) {
  const value = String(text || '').trim()
  return value.slice(0, 1) || '·'
}

export function tintOf(text) {
  let hash = 0
  for (const ch of String(text || '货')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const hue = hash % 360
  return { background: `hsl(${hue} 42% 92%)`, color: `hsl(${hue} 36% 26%)` }
}

export function fmtQty(value) {
  const number = Math.round(Number(value || 0) * 1000) / 1000
  return String(number)
}

export function fmtQtyBlank(value) {
  if (value == null || Number(value) === 0) return ''
  return fmtQty(value)
}

export function fmtMoney(value) {
  return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function queryString(params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value != null && value !== false) search.set(key, value)
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}
