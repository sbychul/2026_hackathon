import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const destination = path.join(root, 'public/models/ocr')
const source = process.argv[2]
const models = [
  { name: 'ch_PP-OCRv5_det_mobile.onnx', task: 'det', sha: '4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae' },
  { name: 'korean_PP-OCRv5_rec_mobile.onnx', task: 'rec', sha: 'cd6e2ea50f6943ca7271eb8c56a877a5a90720b7047fe9c41a2e541a25773c9b' },
]

// 검증값이 일치하는 공개 모델만 배포 경로에 준비한다.
async function prepare() {
  await mkdir(destination, { recursive: true })
  for (const model of models) {
    const target = path.join(destination, model.name)
    let bytes
    try { bytes = await readFile(target) } catch { /* 처음 실행하면 모델을 준비한다. */ }
    if (!bytes || createHash('sha256').update(bytes).digest('hex') !== model.sha) {
      if (source) bytes = await readFile(path.join(source, model.name))
      else {
        const url = `https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.10.0/onnx/PP-OCRv5/${model.task}/${model.name}`
        const response = await fetch(url, { signal: AbortSignal.timeout(120_000) })
        if (!response.ok) throw new Error('공개 모델을 내려받지 못했습니다.')
        bytes = Buffer.from(await response.arrayBuffer())
      }
      if (createHash('sha256').update(bytes).digest('hex') !== model.sha) throw new Error('모델 검증값이 일치하지 않습니다.')
      await writeFile(target, bytes)
    }
    console.log(`${model.name}: ${bytes.length}바이트 검증 완료`)
  }
  const runtime = path.join(root, 'node_modules/onnxruntime-web/dist')
  await mkdir(path.join(destination, 'runtime'), { recursive: true })
  for (const name of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
    if (!(await readdir(runtime)).includes(name)) throw new Error('추론 실행기 파일이 없습니다. 의존성을 먼저 설치해 주세요.')
    await copyFile(path.join(runtime, name), path.join(destination, 'runtime', name))
  }
  console.log('모델과 브라우저 실행기 준비 완료')
}

await prepare()
