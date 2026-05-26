// EvalDisplay.tsx — Eval number + depth + gear button trigger for the
// analysis settings popover. Reused across the three board layouts.

import { useRef, useState } from 'react'
import AnalysisSettingsPopover from './AnalysisSettingsPopover'
import type { EngineDepthPreset, EngineLineCount } from '../../App'

interface Props {
  displayedEvalText: string | null
  currentAnalysisDepth: number
  visibleStartDepth: number
  positionMaxDepth: number
  isAnalyzingPosition: boolean
  fallbackDepthLabel?: string | null   // e.g. "depth 22" when no live analysis is running

  // Popover wiring
  showBestLines: boolean
  setShowBestLines: (v: boolean) => void
  showEvalGraph: boolean
  setShowEvalGraph: (v: boolean) => void
  showReport: boolean
  setShowReport: (v: boolean) => void
  engineLines: EngineLineCount
  setEngineLines: (n: EngineLineCount) => void
  engineDepth: EngineDepthPreset
  setEngineDepth: (d: EngineDepthPreset) => void
  autoAnalyze: boolean
  setAutoAnalyze: (v: boolean) => void
  onAnalyzeNow?: () => void
  onClearVariations?: () => void
  onExportPgn?: () => void
  onExportDeepMoveStats?: () => Promise<boolean> | boolean
  hasVariations: boolean
  canExport: boolean
}

export default function EvalDisplay({
  displayedEvalText,
  currentAnalysisDepth,
  visibleStartDepth,
  positionMaxDepth,
  isAnalyzingPosition,
  fallbackDepthLabel,
  showBestLines,
  setShowBestLines,
  showEvalGraph,
  setShowEvalGraph,
  showReport,
  setShowReport,
  engineLines,
  setEngineLines,
  engineDepth,
  setEngineDepth,
  autoAnalyze,
  setAutoAnalyze,
  onAnalyzeNow,
  onClearVariations,
  onExportPgn,
  onExportDeepMoveStats,
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
        <span className="eval-display-depth">
          depth: {visibleStartDepth} / {positionMaxDepth} …
        </span>
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
            <circle cx="8" cy="3" r="1.4" fill="currentColor" />
            <circle cx="8" cy="8" r="1.4" fill="currentColor" />
            <circle cx="8" cy="13" r="1.4" fill="currentColor" />
          </svg>
        </button>
        <AnalysisSettingsPopover
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={triggerRef}
          showBestLines={showBestLines}
          setShowBestLines={setShowBestLines}
          showEvalGraph={showEvalGraph}
          setShowEvalGraph={setShowEvalGraph}
          showReport={showReport}
          setShowReport={setShowReport}
          engineLines={engineLines}
          setEngineLines={setEngineLines}
          engineDepth={engineDepth}
          setEngineDepth={setEngineDepth}
          autoAnalyze={autoAnalyze}
          setAutoAnalyze={setAutoAnalyze}
          onAnalyzeNow={onAnalyzeNow}
          onClearVariations={onClearVariations}
          onExportPgn={onExportPgn}
          onExportDeepMoveStats={onExportDeepMoveStats}
          hasVariations={hasVariations}
          canExport={canExport}
        />
      </div>
    </div>
  )
}
