<template>
  <main class="phone">
    <header class="brand-block">
      <img src="/brand.jpg" alt="" />
      <h1>丰冠农业</h1>
      <p>库存、入库、出库、回款</p>
    </header>
    <form class="fields" @submit.prevent="submit">
      <input v-model="username" autocomplete="username" placeholder="账号" />
      <input v-model="password" type="password" autocomplete="current-password" placeholder="密码" />
      <p v-if="error" class="err">{{ error }}</p>
      <button class="save" type="submit">进入</button>
    </form>
    <p class="retail">初始账号 admin，初始密码 123456</p>
  </main>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'

const router = useRouter()
const username = ref('admin')
const password = ref('')
const error = ref('')

async function submit() {
  error.value = ''
  try {
    await api('/api/login', { method: 'POST', body: { username: username.value, password: password.value } })
    router.push('/')
  } catch (err) {
    error.value = err.message
  }
}
</script>
