import { createRouter, createWebHistory } from 'vue-router'
import { api } from './api'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('./views/Login.vue') },
    { path: '/', component: () => import('./views/Stock.vue') },
    { path: '/inbound', component: () => import('./views/Move.vue') },
    { path: '/outbound', component: () => import('./views/Outbound.vue') },
    { path: '/records/in', component: () => import('./views/InboundRecords.vue') },
    { path: '/records/out', component: () => import('./views/OutboundRecords.vue') },
    { path: '/payments', component: () => import('./views/PayList.vue') },
    { path: '/manage', component: () => import('./views/Manage.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  if (to.path === '/login') return true
  try {
    await api('/api/me')
    return true
  } catch {
    return '/login'
  }
})
