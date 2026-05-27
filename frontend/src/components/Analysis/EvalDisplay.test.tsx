import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EvalDisplay from './EvalDisplay'

const baseProps = {
  displayedEvalText: '+0.4',
  currentAnalysisDepth: 0,
  positionMaxDepth: 27,
  isAnalyzingPosition: false,
  showBestLines: true,
  setShowBestLines: vi.fn(),
  showEvalGraph: true,
  setShowEvalGraph: vi.fn(),
  showReport: true,
  setShowReport: vi.fn(),
  engineLines: 3 as const,
  setEngineLines: vi.fn(),
  engineDepth: 'max' as const,
  setEngineDepth: vi.fn(),
  autoAnalyze: true,
  setAutoAnalyze: vi.fn(),
  hasVariations: false,
  canExport: false,
}

describe('EvalDisplay', () => {
  it('does not show a fake starting depth while analysis is warming up', () => {
    render(<EvalDisplay {...baseProps} isAnalyzingPosition />)

    expect(screen.getByText('depth: … / 27')).toBeInTheDocument()
    expect(screen.queryByText('depth: 20 / 27 …')).not.toBeInTheDocument()
  })

  it('shows numeric depth only after a displayed engine depth exists', () => {
    render(<EvalDisplay {...baseProps} currentAnalysisDepth={20} isAnalyzingPosition />)

    expect(screen.getByText('depth: 20 / 27 …')).toBeInTheDocument()
  })
})
