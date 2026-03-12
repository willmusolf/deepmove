// App.tsx — Board demo for Track A development
// This will be replaced with proper routing in a later session

import { useState } from 'react'
import ChessBoard from './components/Board/ChessBoard'
import './styles/board.css'

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export default function App() {
  const [fen, setFen] = useState(STARTING_FEN)
  const [inputFen, setInputFen] = useState('')
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const [moveHistory, setMoveHistory] = useState<string[]>([])

  function handleMove(from: string, to: string, newFen: string) {
    setFen(newFen)
    setMoveHistory(h => [...h, `${from}→${to}`])
  }

  function handleLoadFen() {
    const trimmed = inputFen.trim()
    if (trimmed) {
      setFen(trimmed)
      setMoveHistory([])
    }
  }

  function handleReset() {
    setFen(STARTING_FEN)
    setInputFen('')
    setMoveHistory([])
  }

  return (
    <div className="app">
      <header className="demo-header">
        <h1>DeepMove</h1>
        <p className="demo-subtitle">Chess coaching that teaches principles, not moves.</p>
      </header>

      <div className="demo-layout">
        <div className="demo-board-col">
          <ChessBoard
            fen={fen}
            orientation={orientation}
            interactive={true}
            onMove={handleMove}
          />

          <div className="demo-controls">
            <button
              className="btn btn-secondary"
              onClick={() => setOrientation(o => o === 'white' ? 'black' : 'white')}
            >
              Flip Board
            </button>
            <button className="btn btn-secondary" onClick={handleReset}>
              Reset
            </button>
          </div>
        </div>

        <div className="demo-side-col">
          <div className="demo-section">
            <label className="demo-label">Load FEN</label>
            <input
              className="demo-input"
              type="text"
              placeholder="Paste FEN string..."
              value={inputFen}
              onChange={e => setInputFen(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLoadFen()}
            />
            <button className="btn btn-primary" onClick={handleLoadFen}>
              Load
            </button>
          </div>

          <div className="demo-section">
            <label className="demo-label">Move History</label>
            <div className="demo-move-list">
              {moveHistory.length === 0
                ? <span className="demo-muted">No moves yet</span>
                : moveHistory.map((m, i) => <span key={i} className="demo-move">{m}</span>)
              }
            </div>
          </div>

          <div className="demo-section demo-status">
            <label className="demo-label">Current FEN</label>
            <code className="demo-fen">{fen}</code>
          </div>
        </div>
      </div>
    </div>
  )
}
