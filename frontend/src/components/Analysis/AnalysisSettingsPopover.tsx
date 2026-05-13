// AnalysisSettingsPopover.tsx — Small custom popover anchored to the gear button
// in EvalDisplay. Exposes engine knobs (lines, depth, auto-analyze) plus
// per-game variation actions (clear, export PGN with variations).

import { useEffect, useRef, useState } from 'react'
import type { EngineDepthPreset, EngineLineCount } from '../../App'

interface Props {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement>

  engineLines: EngineLineCount
  setEngineLines: (n: EngineLineCount) => void
  engineDepth: EngineDepthPreset
  setEngineDepth: (d: EngineDepthPreset) => void
  autoAnalyze: boolean
  setAutoAnalyze: (v: boolean) => void

  onAnalyzeNow?: () => void
  onClearVariations?: () => void
  onExportPgn?: () => void
  hasVariations: boolean
  canExport: boolean
}

const LINE_OPTIONS: EngineLineCount[] = [1, 2, 3]

const DEPTH_OPTIONS: { value: EngineDepthPreset; label: string; sub: string }[] = [
  { value: 'fast', label: 'Fast', sub: '20' },
  { value: 'standard', label: 'Standard', sub: '25' },
  { value: 'max', label: 'Max', sub: '27' },
]

export default function AnalysisSettingsPopover({
  open,
  onClose,
  anchorRef,
  engineLines,
  setEngineLines,
  engineDepth,
  setEngineDepth,
  autoAnalyze,
  setAutoAnalyze,
  onAnalyzeNow,
  onClearVariations,
  onExportPgn,
  hasVariations,
  canExport,
}: Props) {
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [clearArmed, setClearArmed] = useState(false)
  const [exportFeedback, setExportFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setClearArmed(false)
      setExportFeedback(null)
      return
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handlePointer = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (popoverRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    window.addEventListener('keydown', handleKey)
    window.addEventListener('mousedown', handlePointer)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('mousedown', handlePointer)
    }
  }, [open, onClose, anchorRef])

  useEffect(() => {
    if (!clearArmed) return
    const t = window.setTimeout(() => setClearArmed(false), 2200)
    return () => window.clearTimeout(t)
  }, [clearArmed])

  if (!open) return null

  const handleClearClick = () => {
    if (!clearArmed) {
      setClearArmed(true)
      return
    }
    onClearVariations?.()
    setClearArmed(false)
    onClose()
  }

  const handleExportClick = () => {
    onExportPgn?.()
    setExportFeedback('Copied!')
    window.setTimeout(() => setExportFeedback(null), 1600)
  }

  return (
    <div
      ref={popoverRef}
      className="analysis-settings-popover"
      role="dialog"
      aria-label="Analysis settings"
    >
      <section className="analysis-settings-popover__section">
        <div className="analysis-settings-popover__label">Lines shown</div>
        <div className="analysis-settings-popover__segmented" role="radiogroup">
          {LINE_OPTIONS.map(n => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={engineLines === n}
              className={`analysis-settings-popover__seg${engineLines === n ? ' analysis-settings-popover__seg--active' : ''}`}
              onClick={() => setEngineLines(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <section className="analysis-settings-popover__section">
        <div className="analysis-settings-popover__label">Engine depth</div>
        <div className="analysis-settings-popover__segmented" role="radiogroup">
          {DEPTH_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={engineDepth === opt.value}
              className={`analysis-settings-popover__seg${engineDepth === opt.value ? ' analysis-settings-popover__seg--active' : ''}`}
              onClick={() => setEngineDepth(opt.value)}
              title={`Stockfish depth ${opt.sub}`}
            >
              <span>{opt.label}</span>
              <span className="analysis-settings-popover__seg-sub">{opt.sub}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="analysis-settings-popover__section">
        <label className="analysis-settings-popover__toggle">
          <input
            type="checkbox"
            checked={autoAnalyze}
            onChange={e => setAutoAnalyze(e.target.checked)}
          />
          <span>Auto-analyze on move</span>
        </label>
        {!autoAnalyze && onAnalyzeNow && (
          <button
            type="button"
            className="btn btn-secondary analysis-settings-popover__manual"
            onClick={() => { onAnalyzeNow(); onClose() }}
          >
            Analyze position
          </button>
        )}
      </section>

      <hr className="analysis-settings-popover__divider" />

      <section className="analysis-settings-popover__section">
        <div className="analysis-settings-popover__label">Variations</div>
        <div className="analysis-settings-popover__actions">
          <button
            type="button"
            className={`btn btn-secondary analysis-settings-popover__action${clearArmed ? ' analysis-settings-popover__action--armed' : ''}`}
            onClick={handleClearClick}
            disabled={!hasVariations}
            title={hasVariations
              ? (clearArmed ? 'Click again to confirm' : 'Remove explored variations for this game')
              : 'No variations to clear'}
          >
            {clearArmed ? 'Click to confirm' : 'Clear variations'}
          </button>
        </div>
      </section>

      <section className="analysis-settings-popover__section">
        <div className="analysis-settings-popover__label">Export</div>
        <div className="analysis-settings-popover__actions">
          <button
            type="button"
            className="btn btn-secondary analysis-settings-popover__action"
            onClick={handleExportClick}
            disabled={!canExport}
            title={canExport ? 'Copy PGN with all variations' : 'No game loaded'}
          >
            {exportFeedback ?? 'Copy PGN'}
          </button>
        </div>
      </section>
    </div>
  )
}
