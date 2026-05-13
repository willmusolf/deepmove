// EvalDisplay.tsx — Eval number + depth + gear button trigger for the
// analysis settings popover. Reused across the three board layouts.

import { useRef, useState } from 'react'
import AnalysisSettingsPopover from './AnalysisSettingsPopover'
import type { EngineDepthPreset, EngineLineCount } from '../../App'

interface Props {
  displayedEvalText: string | null
  currentAnalysisDepth: number
  positionMaxDepth: number
  isAnalyzingPosition: boolean
  fallbackDepthLabel?: string | null   // e.g. "depth 22" when no live analysis is running

  // Popover wiring
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

export default function EvalDisplay({
  displayedEvalText,
  currentAnalysisDepth,
  positionMaxDepth,
  isAnalyzingPosition,
  fallbackDepthLabel,
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
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="eval-display">
      {displayedEvalText && (
        <span className="eval-display-value">{displayedEvalText}</span>
      )}
      {currentAnalysisDepth > 0 ? (
        <span className="eval-display-depth">
          depth: {currentAnalysisDepth} / {positionMaxDepth}{isAnalyzingPosition ? ' …' : ''}
        </span>
      ) : isAnalyzingPosition ? (
        <span className="eval-display-depth">analyzing…</span>
      ) : fallbackDepthLabel ? (
        <span className="eval-display-depth">{fallbackDepthLabel}</span>
      ) : null}

      <div className="eval-display-settings">
        <button
          ref={triggerRef}
          type="button"
          className={`eval-display-gear${open ? ' eval-display-gear--open' : ''}`}
          aria-label="Analysis settings"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm6.6 3.2-1.4-.8a5.4 5.4 0 0 0 0-1.8l1.4-.8a.5.5 0 0 0 .2-.6l-1.3-2.3a.5.5 0 0 0-.6-.2l-1.6.5a5.6 5.6 0 0 0-1.6-.9l-.2-1.6a.5.5 0 0 0-.5-.4H7a.5.5 0 0 0-.5.4l-.2 1.6a5.6 5.6 0 0 0-1.6.9l-1.6-.5a.5.5 0 0 0-.6.2L1.2 4.7a.5.5 0 0 0 .2.6l1.4.8a5.4 5.4 0 0 0 0 1.8l-1.4.8a.5.5 0 0 0-.2.6l1.3 2.3a.5.5 0 0 0 .6.2l1.6-.5c.5.4 1 .7 1.6.9l.2 1.6c0 .2.2.4.5.4h2a.5.5 0 0 0 .5-.4l.2-1.6c.6-.2 1.1-.5 1.6-.9l1.6.5c.2.1.4 0 .6-.2l1.3-2.3a.5.5 0 0 0-.2-.6Z"
            />
          </svg>
        </button>
        <AnalysisSettingsPopover
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={triggerRef}
          engineLines={engineLines}
          setEngineLines={setEngineLines}
          engineDepth={engineDepth}
          setEngineDepth={setEngineDepth}
          autoAnalyze={autoAnalyze}
          setAutoAnalyze={setAutoAnalyze}
          onAnalyzeNow={onAnalyzeNow}
          onClearVariations={onClearVariations}
          onExportPgn={onExportPgn}
          hasVariations={hasVariations}
          canExport={canExport}
        />
      </div>
    </div>
  )
}
