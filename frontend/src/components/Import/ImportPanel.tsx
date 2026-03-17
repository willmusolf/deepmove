import { useState } from 'react'
import { Chess } from 'chess.js'
import { useGameStore } from '../../stores/gameStore'

interface ImportPanelProps {
  onFenLoad: (fen: string) => void
}

export default function ImportPanel({ onFenLoad }: ImportPanelProps) {
  const [pgnInput, setPgnInput] = useState('')
  const [fenInput, setFenInput] = useState('')
  const [fenError, setFenError] = useState<string | null>(null)

  const setPgn = useGameStore(s => s.setPgn)
  const setUserColor = useGameStore(s => s.setUserColor)
  const reset = useGameStore(s => s.reset)

  function handleLoadPgn() {
    const trimmed = pgnInput.trim()
    if (!trimmed) return
    reset()
    setUserColor(null)
    setPgn(trimmed)
  }

  function handleLoadFen() {
    const trimmed = fenInput.trim()
    if (!trimmed) { setFenError('Please enter a FEN string.'); return }
    try {
      new Chess(trimmed)
    } catch {
      setFenError('Invalid FEN — check the format and try again.')
      return
    }
    setFenError(null)
    onFenLoad(trimmed)
    setFenInput('')
  }

  return (
    <div className="import-panel">
      <label className="import-label">Paste PGN</label>
      <textarea
        className="import-textarea"
        placeholder="Paste PGN here... (Enter to load)"
        value={pgnInput}
        onChange={e => setPgnInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleLoadPgn() } }}
        rows={8}
      />
      
      <button className="btn btn-primary" onClick={handleLoadPgn} disabled={!pgnInput.trim()}>
        Load Game
      </button>

      <label className="import-label" style={{ marginTop: '0.5rem' }}>Load Position (FEN)</label>
      <div className="fen-row">
        <input
          className="fen-input"
          type="text"
          placeholder="Paste FEN string..."
          value={fenInput}
          onChange={e => setFenInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleLoadFen() }}
        />
        <button className="btn btn-secondary" onClick={handleLoadFen} disabled={!fenInput.trim()}>
          Load
        </button>
      </div>
      {fenError && <div className="import-error">{fenError}</div>}
    </div>
  )
}
