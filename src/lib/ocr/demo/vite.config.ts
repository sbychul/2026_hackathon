import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { copyFile } from 'node:fs/promises'
import path from 'node:path'

// 기존 앱과 독립적으로 배포할 검증 화면의 빌드 진입점을 지정한다.
export default defineConfig({
  build: { rollupOptions: { input: fileURLToPath(new URL('./index.html', import.meta.url)) } },
  worker: { format: 'es' },
  plugins: [{name:'첨부-화면-첫페이지',
    // 정적 사이트의 첫 주소에서도 첨부 화면이 열리도록 같은 진입 문서를 배치한다.
    async writeBundle(options) {
      const output=path.resolve(options.dir??'dist')
      await copyFile(path.join(output,'src/lib/ocr/demo/index.html'),path.join(output,'index.html'))
    },
  }],
})
