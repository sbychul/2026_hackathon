import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { createManualRegion, displaySize, rotationTransform, toStoredPoint, type ManualRegion, type PageSize, type Point, type QuarterTurn } from '../../lib/pdf/manualRegions'
import type { PdfMaskRegion } from '../../lib/pdf/export'

interface Props {
  src: string
  page: PageSize
  pageNumber: number
  rotation: QuarterTurn
  zoom: number
  enabled: boolean
  automatic: readonly PdfMaskRegion[]
  manual: readonly ManualRegion[]
  onAdd: (region: ManualRegion) => void
  onEditingChange: (editing: boolean) => void
}

// 최종 이미지 위에서 영역을 지정하고 화면 배율과 회전을 저장 좌표로 되돌린다.
export default function RegionEditor({ src, page, pageNumber, rotation, zoom, enabled, automatic, manual, onAdd, onEditingChange }: Props) {
  const [draft, setDraft] = useState<ManualRegion | null>(null)
  const start = useRef<{ point: Point; pointerId: number } | null>(null)
  const size = displaySize(page, rotation)

  // 영역 선택 중 화면이 바뀌면 내려받기 잠금과 임시 드래그를 해제한다.
  useEffect(() => () => {
    if (start.current) onEditingChange(false)
  }, [onEditingChange])

  // 포인터 위치를 테두리가 없는 그림 영역의 저장 좌표로 바꾼다.
  const point = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return toStoredPoint({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, bounds, page, rotation)
  }

  // 주 포인터를 붙잡아 페이지 밖으로 나가도 드래그를 이어 간다.
  const begin = (event: PointerEvent<SVGSVGElement>) => {
    if (!enabled || !event.isPrimary || event.button !== 0 || start.current) return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    start.current = { point: point(event), pointerId: event.pointerId }
    onEditingChange(true)
  }

  // 드래그 중인 사각형을 기본 좌표로 표시한다.
  const move = (event: PointerEvent<SVGSVGElement>) => {
    if (start.current?.pointerId !== event.pointerId) return
    setDraft(createManualRegion(start.current.point, point(event), page, pageNumber, '지정 중'))
  }

  // 드래그를 끝내고 유효한 영역만 추가하거나 취소한다.
  const finish = (event: PointerEvent<SVGSVGElement>, commit: boolean) => {
    const current = start.current
    if (!current || current.pointerId !== event.pointerId) return
    start.current = null
    setDraft(null)
    if (commit) {
      const region = createManualRegion(current.point, point(event), page, pageNumber, crypto.randomUUID())
      if (region) onAdd(region)
    }
    onEditingChange(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <svg className={`pdf-region-editor ${enabled ? 'is-editing' : ''} ${zoom <= 1 ? 'is-fit' : ''}`} width={Math.min(704, size.width) * zoom} viewBox={`0 0 ${size.width} ${size.height}`}
      style={{ aspectRatio: `${size.width} / ${size.height}` }} role="img" aria-label={`${pageNumber}쪽 가린 결과${enabled ? ', 사각형을 드래그해 직접 가리기' : ''}`}
      onPointerDown={begin} onPointerMove={move} onPointerUp={(event) => finish(event, true)}
      onPointerCancel={(event) => finish(event, false)} onLostPointerCapture={(event) => finish(event, false)}
      onKeyDown={(event) => {
        // 도중에 취소하면 새 영역을 추가하지 않고 내려받기 잠금을 해제한다.
        if (event.key === 'Escape') { start.current = null; setDraft(null); onEditingChange(false) }
      }} tabIndex={enabled ? 0 : undefined}>
      <g transform={rotationTransform(page, rotation)}>
        <image href={src} x="0" y="0" width={page.width} height={page.height} />
        {enabled && automatic.filter((region) => region.pageNumber === pageNumber).map((region, index) => (
          <rect key={index} {...{ x: region.x, y: region.y, width: region.width, height: region.height }} className="pdf-auto-outline" />
        ))}
        {enabled && manual.filter((region) => region.pageNumber === pageNumber).map((region) => (
          <rect key={region.id} {...{ x: region.x, y: region.y, width: region.width, height: region.height }} className="pdf-manual-outline"><title>직접 추가 영역</title></rect>
        ))}
        {draft && <rect x={draft.x} y={draft.y} width={draft.width} height={draft.height} className="pdf-draft" />}
      </g>
    </svg>
  )
}
