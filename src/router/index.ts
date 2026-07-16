import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            name: 'main',
            component: MainLayout,
        },
        {
            path: '/run',
            name: 'run',
            component: () => import('@/views/RunView.vue'),
        },
    ],
})

export default router