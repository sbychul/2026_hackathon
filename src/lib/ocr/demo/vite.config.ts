import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// 기존 앱과 독립적으로 배포할 검증 화면의 빌드 진입점을 지정한다.
export default defineConfig({ build: { rollupOptions: { input: fileURLToPath(new URL('./index.html', import.meta.url)) } }, worker: { format: 'es' } })
