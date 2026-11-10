<template>
  <main class="phone">
    <header class="top">
      <div class="page-head">
        <img src="/icon-pay.jpg" alt="" />
        <div>
          <p class="eyebrow">丰冠农业</p>
          <h1>回款</h1>
        </div>
      </div>
      <router-link class="back" to="/">返回</router-link>
    </header>

    <section class="pay-total">
      <div>
        <span>{{ rangeLabel }}已回款</span>
        <strong>{{ money(total) }}</strong>
        <em>元 · {{ rows.length }} 笔</em>
      </div>
    </section>
    <p class="range-note">{{ rangeNote }}</p>

    <div class="seg">
      <button type="button" :class="{ on: range === '1y' }" @click="pick('1y')">最近一年</button>
      <button type="button" :class="{ on: range === '3y' }" @click="pick('3y')">最近3年</button>
      <button type="button" :class="{ on: range === 'all' }" @click="pick('all')">全部</button>
    </div>
    <div class="search-row">
      <input v-model="customer" class="search" placeholder="客户名称" @input="schedule" />
      <button v-if="customer" type="button" @click="clearCustomer">清除</button>
    </div>

    <p v-if="loaded && !rows.length" class="empty">{{ emptyText }}</p>
    <article v-for="row in rows" :key="row.id" class="rec">
      <span class="avatar" :style="tintOf(row.customerName)">{{ markOf(row.customerName) }}</span>
      <div>
        <strong>{{ row.customerName || '未填客户' }}</strong>
        <em>{{ cnDate(row.bizDate) }} · {{ row.paymentMethodName || '未填方式' }}</em>
        <em v-if="row.variety">{{ row.variety }} {{ row.spec }}</em>
      </div>
      <b>{{ money(row.receivedAmount) }}</b>
    </article>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { cnDate, markOf, queryString, tintOf, today, yearsAgo } from '../format'

const range = ref('1y')
const customer = ref('')
const total = ref(0)
const rows = ref([])
const loaded = ref(false)

const rangeLabel = computed(() => (range.value === '3y' ? '最近3年' : range.value === 'all' ? '全部' : '最近一年'))
const rangeNote = computed(() => {
  if (range.value === 'all') return '不限日期'
  const years = range.value === '3y' ? 3 : 1
  return `${cnDate(yearsAgo(years))} 至 ${cnDate(today())}`
})
const emptyText = computed(() => (customer.value.trim() ? '没有找到这个客户的回款' : `${rangeLabel.value}没有回款`))

function money(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}

function filters() {
  const query = { customer: customer.value.trim() }
  if (range.value === '1y' || range.value === '3y') {
    query.dateFrom = yearsAgo(range.value === '3y' ? 3 : 1)
    query.dateTo = today()
  }
  return query
}

async function load() {
  const data = await api(`/api/stats/payments${queryString(filters())}`)
  total.value = data.totalAmount
  rows.value = data.rows
  loaded.value = true
}

function pick(next) {
  range.value = next
  load()
}

function clearCustomer() {
  customer.value = ''
  load()
}

let timer
function schedule() {
  clearTimeout(timer)
  timer = setTimeout(load, 250)
}

onMounted(load)
</script>
