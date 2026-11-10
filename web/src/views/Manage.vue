<template>
  <main class="phone">
    <header class="top">
      <div class="page-head">
        <img src="/brand.jpg" alt="" />
        <div>
          <p class="eyebrow">丰冠农业</p>
          <h1>管理</h1>
        </div>
      </div>
      <router-link class="back" to="/">返回</router-link>
    </header>

    <section class="block">
      <h2>库房</h2>
      <p v-if="!platforms.length" class="retail">还没有库房。</p>
      <div v-for="item in platforms" :key="item.id" class="manage-row">
        <strong>{{ short(item.name) }}</strong>
        <button type="button" class="text-danger" @click="askDelete('platform', item)">删除</button>
      </div>
      <div class="fields">
        <input v-model="platformName" placeholder="新库房名称，例如 赤峰" @keyup.enter="addPlatform" />
        <button class="save" type="button" @click="addPlatform">添加库房</button>
      </div>
    </section>

    <section class="block">
      <h2>业务员</h2>
      <p v-if="!salespersons.length" class="retail">还没有业务员。出库时写上名字也会记在这里。</p>
      <div v-for="item in salespersons" :key="item.id" class="manage-row">
        <strong>{{ item.name }}</strong>
        <button type="button" class="text-danger" @click="askDelete('person', item)">删除</button>
      </div>
      <div class="fields">
        <input v-model="personName" placeholder="业务员姓名" @keyup.enter="addPerson" />
        <button class="save" type="button" @click="addPerson">添加业务员</button>
      </div>
    </section>

    <section class="block">
      <h2>导出</h2>
      <div class="fields">
        <button class="save" type="button" :disabled="exporting !== ''" @click="exportBook('/api/export/inbounds')">{{ exporting === 'in' ? '正在导出' : '导出入库记录' }}</button>
        <button class="save" type="button" :disabled="exporting !== ''" @click="exportBook('/api/export/outbounds')">{{ exporting === 'out' ? '正在导出' : '导出出库记录' }}</button>
      </div>
      <p v-if="exportError" class="err">{{ exportError }}</p>
    </section>

    <section class="block">
      <h2>登录密码</h2>
      <div class="fields">
        <input v-model="oldPassword" type="password" autocomplete="current-password" placeholder="现在的密码" />
        <input v-model="newPassword" type="password" autocomplete="new-password" placeholder="新密码，至少 6 位" />
        <input v-model="again" type="password" autocomplete="new-password" placeholder="再写一遍新密码" />
        <button class="save" type="button" :disabled="passwordBusy" @click="changePassword">{{ passwordBusy ? '正在改' : '修改密码' }}</button>
      </div>
      <p v-if="passwordError" class="err">{{ passwordError }}</p>
      <p v-if="passwordOk" class="hint">密码已改好，下次用新密码登录。</p>
    </section>

    <p v-if="error" class="err">{{ error }}</p>

    <div v-if="target" class="mask" @click.self="target = null">
      <form class="sheet" @submit.prevent="confirmDelete">
        <h2>删除{{ target.name }}</h2>
        <p>{{ target.kind === 'platform' ? '已经记过入库或出库的库删不掉。' : '已经用在出库或客户上的业务员删不掉。' }}</p>
        <p v-if="deleteError" class="err">{{ deleteError }}</p>
        <div class="sheet-actions">
          <button type="button" @click="target = null">取消</button>
          <button class="danger" type="submit" :disabled="busy">确认删除</button>
        </div>
      </form>
    </div>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { api, download } from '../api'

const platforms = ref([])
const salespersons = ref([])
const platformName = ref('')
const personName = ref('')
const error = ref('')
const target = ref(null)
const deleteError = ref('')
const busy = ref(false)
const oldPassword = ref('')
const newPassword = ref('')
const again = ref('')
const passwordError = ref('')
const passwordOk = ref(false)
const passwordBusy = ref(false)
const exporting = ref('')
const exportError = ref('')

function short(name) {
  return String(name || '').replace(/平台$/, '')
}

async function load() {
  const meta = await api('/api/meta')
  platforms.value = meta.platforms
  salespersons.value = meta.salespersons
}

async function addPlatform() {
  error.value = ''
  const name = platformName.value.trim()
  if (!name) {
    error.value = '先写库房名称'
    return
  }
  try {
    await api('/api/platforms', { method: 'POST', body: { name } })
    platformName.value = ''
    await load()
  } catch (err) {
    error.value = err.message
  }
}

async function addPerson() {
  error.value = ''
  const name = personName.value.trim()
  if (!name) {
    error.value = '先写业务员姓名'
    return
  }
  try {
    await api('/api/salespersons', { method: 'POST', body: { name } })
    personName.value = ''
    await load()
  } catch (err) {
    error.value = err.message
  }
}

async function changePassword() {
  passwordError.value = ''
  passwordOk.value = false
  if (!oldPassword.value) {
    passwordError.value = '先写现在的密码'
    return
  }
  if (newPassword.value.length < 6) {
    passwordError.value = '新密码至少 6 位'
    return
  }
  if (newPassword.value !== again.value) {
    passwordError.value = '两次新密码不一样'
    return
  }
  passwordBusy.value = true
  try {
    await api('/api/password', { method: 'POST', body: { oldPassword: oldPassword.value, newPassword: newPassword.value } })
    oldPassword.value = ''
    newPassword.value = ''
    again.value = ''
    passwordOk.value = true
  } catch (err) {
    passwordError.value = err.message
  } finally {
    passwordBusy.value = false
  }
}

async function exportBook(path) {
  exportError.value = ''
  exporting.value = path.includes('inbounds') ? 'in' : 'out'
  try {
    await download(path)
  } catch (err) {
    exportError.value = err.message
  } finally {
    exporting.value = ''
  }
}

function askDelete(kind, item) {
  deleteError.value = ''
  target.value = { kind, id: item.id, name: kind === 'platform' ? short(item.name) : item.name }
}

async function confirmDelete() {
  deleteError.value = ''
  busy.value = true
  try {
    const path = target.value.kind === 'platform' ? '/api/platforms/' : '/api/salespersons/'
    await api(`${path}${target.value.id}`, { method: 'DELETE' })
    target.value = null
    await load()
  } catch (err) {
    deleteError.value = err.message
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>
