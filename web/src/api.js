let onUnauthorized = () => {}

export function setUnauthorized(fn) {
  onUnauthorized = fn
}

export async function api(path, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(path, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('没有连上服务器，这笔没记下。')
  }
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (response.status === 401 && !path.startsWith('/api/login')) {
    onUnauthorized()
    throw new Error(data.message || '请先登录')
  }
  if (!response.ok) throw new Error(data.message || '操作没有成功')
  return data
}

export async function download(path) {
  const response = await fetch(path, { credentials: 'include' })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.message || '导出失败')
  }
  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') || ''
  const matched = disposition.match(/filename\*=UTF-8''([^;]+)/)
  const name = matched ? decodeURIComponent(matched[1]) : '出库明细.xlsx'
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
