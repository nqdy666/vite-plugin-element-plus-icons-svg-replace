import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import VitePluginElementPlusIconsSvgReplace from '../../src/index.ts'

export default defineConfig({
  plugins: [vue(), VitePluginElementPlusIconsSvgReplace({ configPath: 'customEpIcon.json' })],
})
