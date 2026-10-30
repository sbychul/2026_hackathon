import { useCallback, useEffect, useState } from 'react'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { exportMaskedPdf, type PdfMaskRegion } from '../lib/pdf/export'
import Button from './Button'
import RegionEditor from './pdf/RegionEditor'
import { type ManualRegion, type PageSize, type QuarterTurn } from '../lib/pdf/manualRegions'
import './PdfPreview.css'

interface Preview {
  regions: readonly PdfMaskRegion[]
  bytes: Uint8Array
  pages: { src: string; size: PageSize }[]
}

interface PdfPreviewProps {
  bytes: Uint8Array
  regions: readonly PdfMaskRegion[]
  filename: string
  pageCount: number
  automatic?: readonly PdfMaskRegion[]
  manual?: readonly ManualRegion[]
  onAdd?: (region: ManualRegion) => void
  onEditingChange?: (editing: boolean) => void
  onReady: (blob: Blob, regions: readonly PdfMaskRegion[]) => void
}

// 이미지로 구운 최종 PDF를 다시 그려 보여 주고, 확인한 파일만 내려받게 한다.
export default function PdfPreview({ bytes, regions, filename, pageCount, onReady, automatic = [], manual = [], onAdd, onEditingChange }: PdfPreviewProps) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState<QuarterTurn>(0)
  const [pageNumber, setPageNumber] = useState(1)
  const ready = preview?.regions === regions && preview.bytes === bytes
  const currentPage = preview?.pages[Math.min(pageNumber, pageCount) - 1]


  // 진행 중인 드래그가 끝날 때까지 이전 결과의 다운로드를 잠근다.
  const handleEditingChange = useCallback((value: boolean) => {
    setDrawing(value)
    onEditingChange?.(value)
  }, [onEditingChange])

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
        const pages: { src: string; size: PageSize }[] = []
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
              pages.push({ src: canvas.toDataURL('image/png'), size: { width: base.width, height: base.height } })
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
          setPreview({ bytes, regions, pages })
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
      {onAdd && <div className="pdf-tools" aria-label="문서 도구">
        <Button variant={editing ? 'primary' : 'secondary'} disabled={!ready || drawing} aria-pressed={editing} onClick={() => setEditing(!editing)}>영역 추가</Button>
        <Button variant="secondary" disabled={drawing || zoom <= 0.5} onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}>축소</Button>
        <span>{Math.round(zoom * 100)}%</span>
        <Button variant="secondary" disabled={drawing || zoom >= 2} onClick={() => setZoom(Math.min(2, zoom + 0.25))}>확대</Button>
        <Button variant="secondary" disabled={drawing} onClick={() => setRotation(((rotation + 90) % 360) as QuarterTurn)}>회전</Button>
      </div>}
      {onAdd && <p className="pdf-editor-help">{editing ? '사각형을 드래그해 놓친 부분을 가려 주세요. 초록 실선은 자동 탐지, 점선은 직접 영역이에요. 취소하려면 Esc 키를 누르세요.' : '영역 추가를 누르면 페이지 위에서 직접 가릴 수 있어요.'}</p>}
      {error ? <p className="pdf-status" role="alert">{error}</p> : !ready ? (
        <p className="pdf-status" role="status">가린 페이지를 만들고 있어요…</p>
      ) : (
        <>
          <div className="pdf-pages pdf-edit-pages">
            {currentPage && <RegionEditor key={`${pageNumber}-${rotation}-${zoom}-${editing}`} src={currentPage.src} page={currentPage.size} pageNumber={pageNumber}
              rotation={rotation} zoom={zoom} enabled={editing && !!onAdd} automatic={automatic} manual={manual}
              onAdd={onAdd ?? (() => {})} onEditingChange={handleEditingChange} />}
          </div>
          <nav className="pdf-tools" aria-label="페이지 이동">
            <Button variant="secondary" disabled={drawing || pageNumber <= 1} onClick={() => setPageNumber(pageNumber - 1)}>이전 쪽</Button>
            <span className="mono">{pageNumber} / {pageCount}쪽</span>
            <Button variant="secondary" disabled={drawing || pageNumber >= pageCount} onClick={() => setPageNumber(pageNumber + 1)}>다음 쪽</Button>
          </nav>
          <p className="pdf-editor-help" role="status">최종 미리보기 준비 완료 · 확인한 결과와 같은 문서를 받아요.</p>
        </>
      )}
    </section>
  )
}
