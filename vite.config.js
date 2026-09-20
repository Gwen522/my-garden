import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // 相对路径，保证部署到 GitHub Pages 子路径也能正常加载
  base: './',
})
