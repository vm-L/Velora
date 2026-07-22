import { createRouter, createWebHashHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Settings from '../views/Settings.vue'
import ResourceView from '../views/ResourceView.vue'
import VideoDetail from '../views/VideoDetail.vue'

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
      component: Settings
    },
    {
      path: '/resource/:type/:id',
      name: 'Resource',
      component: ResourceView
    },
    {
      path: '/resource/:type/:id/video/:vodId',
      name: 'VideoDetail',
      component: VideoDetail
    }
  ]
})

export default router
