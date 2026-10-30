import * as ort from 'onnxruntime-web/wasm'
import { detectionBoxes } from './geometry'
import { decodeText, normalizedImage } from './preprocess'
import { downloadAsset } from './download'
import type { ModelDownload, OcrLine, OcrProgress } from './types'

const root = new URL(`${import.meta.env.BASE_URL}models/ocr/`, self.location.origin).href
ort.env.wasm.numThreads = 1
ort.env.wasm.wasmPaths = `${root}runtime/`
ort.env.logLevel = 'error'

// 두 경량 모델과 해당 인식기의 문자 사전을 사용자 기기 메모리에 올린다.
export async function loadEngine(progress: (value: OcrProgress) => void) {
  const downloads: ModelDownload[] = [
    { name:'ch_PP-OCRv5_det_mobile.onnx',label:'글자 위치 찾기 모델',loaded:0,total:4_819_576 },
    { name:'korean_PP-OCRv5_rec_mobile.onnx',label:'한국어 글자 읽기 모델',loaded:0,total:13_488_748 },
  ]
  // 병렬로 받은 두 모델의 실제 수신량을 합산해 작업자 밖에 전달한다.
  const report = (modelsReady = false) => progress({stage:'models',completed:downloads.reduce((sum,item)=>sum+item.loaded,0),total:downloads.reduce((sum,item)=>sum+item.total,0),downloads:downloads.map(item=>({...item})),modelsReady})
  // 모델의 고정 크기를 기준으로 압축 전송과 캐시 응답에서도 올바른 비율을 표시한다.
  const model = (index: number) => downloadAsset(`${root}${downloads[index].name}`,downloads[index].total,loaded=>{downloads[index].loaded=loaded;report()})
  report()
  const [detector, recognizer, dictionaryBuffer] = await Promise.all([
    model(0).then(bytes => ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] })),
    model(1).then(bytes => ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] })),
    fetch(`${root}korean-dictionary.json`,{credentials:'omit'}).then(response=>{
      if (!response.ok) throw new Error('모델의 문자 사전을 준비하지 못했습니다.')
      return response.arrayBuffer()
    }),
  ])
  const dictionary: string[] = JSON.parse(new TextDecoder().decode(dictionaryBuffer))
  if (!Array.isArray(dictionary) || dictionary.length !== 11947 || dictionary.some(char => typeof char !== 'string')) throw new Error('모델의 문자 사전이 올바르지 않습니다.')
  report(true)
  return { detector, recognizer, dictionary }
}

// 한 페이지의 글자 영역을 검출한 뒤 각 영역의 글자를 차례로 인식한다.
export async function recognizePage(image: ImageBitmap, engine: Awaited<ReturnType<typeof loadEngine>>, progress: (value: OcrProgress) => void): Promise<OcrLine[]> {
  const ratio = Math.min(1, 960 / Math.max(image.width, image.height))
  const width = Math.max(32, Math.round(image.width * ratio / 32) * 32)
  const height = Math.max(32, Math.round(image.height * ratio / 32) * 32)
  progress({ stage: 'detect', completed: 0, total: 1 })
  const input = new ort.Tensor('float32', normalizedImage(image, width, height), [1, 3, height, width])
  const output = await engine.detector.run({ [engine.detector.inputNames[0]]: input })
  const probability = output[engine.detector.outputNames[0]]
  const boxes = detectionBoxes(probability.data as Float32Array, Number(probability.dims[3]), Number(probability.dims[2]), image.width, image.height)
  input.dispose(); Object.values(output).forEach(tensor => tensor.dispose())
  if (!boxes.length) throw new Error('글자 영역을 찾지 못했습니다. 개인정보가 없다는 뜻은 아닙니다.')
  const lines: OcrLine[] = []
  for (const [index, box] of boxes.entries()) {
    const contentWidth = Math.ceil(48 * box.width / box.height)
    const cropWidth = Math.max(320, contentWidth)
    if (cropWidth > 4096) throw new Error('너무 긴 글자 영역이 있습니다. 문서를 나누어 주세요.')
    const tensor = new ort.Tensor('float32', normalizedImage(image, cropWidth, 48, box, contentWidth), [1, 3, 48, cropWidth])
    const prediction = await engine.recognizer.run({ [engine.recognizer.inputNames[0]]: tensor })
    const result = prediction[engine.recognizer.outputNames[0]]
    const decoded = decodeText(result.data as Float32Array, Number(result.dims[1]), Number(result.dims[2]), engine.dictionary)
    if (decoded.text.trim()) lines.push({ ...decoded, box })
    tensor.dispose(); Object.values(prediction).forEach(item => item.dispose())
    progress({ stage: 'recognize', completed: index + 1, total: boxes.length })
  }
  if (!lines.length) throw new Error('글자를 읽지 못했습니다. 다른 해상도의 자료로 다시 확인해 주세요.')
  return lines
}
