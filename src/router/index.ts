import { createRouter, createWebHashHistory } from 'vue-router'
import Home from '../views/Home.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: Home
    },
    {
      path: '/settings',
      name: 'Settings',
      component: () => import('../views/Settings.vue')
    },
    {
      path: '/help',
      name: 'Help',
      component: () => import('../views/Help.vue')
    },
    {
      path: '/resource/:type/:id',
      name: 'Resource',
      component: () => import('../views/ResourceView.vue')
    },
    {
      path: '/resource/:type/:id/video/:vodId',
      name: 'VideoDetail',
      component: () => import('../views/VideoDetail.vue')
    }
  ]
})

export default router
