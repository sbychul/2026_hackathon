import { useEffect, useState } from 'react'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { exportMaskedPdf, type PdfMaskRegion } from '../lib/pdf/export'
import './PdfPreview.css'

interface Preview {
  regions: readonly PdfMaskRegion[]
  pages: string[]
}

interface PdfPreviewProps {
  bytes: Uint8Array
  regions: readonly PdfMaskRegion[]
  filename: string
  pageCount: number
  onReady: (blob: Blob, regions: readonly PdfMaskRegion[]) => void
}

// 이미지로 구운 최종 PDF를 다시 그려 보여 주고, 확인한 파일만 내려받게 한다.
export default function PdfPreview({ bytes, regions, filename, pageCount, onReady }: PdfPreviewProps) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const ready = preview?.regions === regions

  useEffect(() => {
    let cancelled = false
    // 연속 선택 시 마지막 선택만 이미지로 굽는다.
    const timer = setTimeout(async () => {
      setError('')
      try {
        const sourceTask = pdfjs.getDocument({ data: bytes.slice() })
        let blob: Blob
        try {
          const source = await sourceTask.promise
          blob = await exportMaskedPdf(source, regions)
        } finally {
          await sourceTask.destroy()
        }
        if (cancelled) return
        const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
        const pages: string[] = []
        try {
          const doc = await task.promise
          for (let n = 1; n <= doc.numPages; n++) {
            if (cancelled) return
            const page = await doc.getPage(n)
            const base = page.getViewport({ scale: 1 })
            const viewport = page.getViewport({ scale: Math.min(1, 704 / base.width) })
            const canvas = document.createElement('canvas')
            canvas.width = Math.ceil(viewport.width)
            canvas.height = Math.ceil(viewport.height)
            try {
              const context = canvas.getContext('2d')
              if (!context) throw new Error('미리보기를 그릴 수 없어요.')
              await page.render({ canvas, canvasContext: context, viewport }).promise
              pages.push(canvas.toDataURL('image/png'))
            } finally {
              canvas.width = 0
              canvas.height = 0
              page.cleanup()
            }
          }
        } finally {
          await task.destroy()
        }
        if (!cancelled) {
          setPreview({ regions, pages })
          onReady(blob, regions)
        }
      } catch {
        if (!cancelled) setError('미리보기를 만들지 못했어요. 항목을 다시 선택하거나 처음부터 다시 시도해 주세요.')
      }
    }, 100)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [bytes, regions, onReady])

  return (
    <section className="pdf-preview" aria-label="가린 결과 미리보기" aria-busy={!ready && !error}>
      <div className="doc-head">
        <h2 className="doc-title">가린 결과 미리보기</h2>
        <span className="mono pdf-filename">{filename} · {pageCount}쪽</span>
      </div>
      {error ? <p className="pdf-status" role="alert">{error}</p> : !ready ? (
        <p className="pdf-status" role="status">가린 페이지를 만들고 있어요…</p>
      ) : (
        <div className="pdf-pages">
          {preview.pages.map((src, i) => (
            <figure className="pdf-page" key={i}>
              <img src={src} alt={`${i + 1}쪽 가린 결과`} />
              <figcaption className="mono">{i + 1} / {pageCount}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  )
}
