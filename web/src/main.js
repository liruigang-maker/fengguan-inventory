import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { setUnauthorized } from './api'
import './styles.css'

setUnauthorized(() => {
  if (router.currentRoute.value.path !== '/login') router.push('/login')
})

const app = createApp(App)
app.use(router)
app.mount('#app')
