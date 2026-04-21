import { useState } from 'react'
import type { PlayConfig, TimeControl, BotSpeed } from '../../stores/playStore'

interface Props {
  initialOrientation: 'white' | 'black'
  onStart: (config: PlayConfig) => void
  engineReady?: boolean
}

const TIME_CONTROLS: { value: TimeControl; label: string }[] = [
  { value: 'none',  label: 'None' },
  { value: '5+0',   label: '5+0' },
  { value: '10+0',  label: '10+0' },
  { value: '15+10', label: '15+10' },
]

const BOT_SPEEDS: { value: BotSpeed; label: string; hint: string }[] = [
  { value: 'instant', label: 'Instant', hint: 'Plays immediately' },
  { value: 'fast',    label: 'Fast',    hint: '~0.8s think time' },
  { value: 'normal',  label: 'Normal',  hint: '~1.5s think time' },
  { value: 'slow',    label: 'Slow',    hint: '~3s think time' },
]

function getEloLabel(elo: number): string {
  if (elo < 800)  return 'Beginner'
  if (elo < 1200) return 'Club Player'
  if (elo < 1600) return 'Intermediate'
  if (elo < 2000) return 'Advanced'
  if (elo < 2400) return 'Expert'
  return 'Master'
}

function getIncrementMs(tc: TimeControl): number {
  return tc === '15+10' ? 10_000 : 0
}

export default function PlaySetupPanel({ initialOrientation, onStart, engineReady = true }: Props) {
  const [botElo, setBotElo] = useState(1200)
  const [timeControl, setTimeControl] = useState<TimeControl>('none')
  const [botSpeed, setBotSpeed] = useState<BotSpeed>('normal')

  function handleStart() {
    onStart({
      userColor: initialOrientation,
      botElo,
      timeControl,
      incrementMs: getIncrementMs(timeControl),
      botSpeed,
    })
  }

  return (
    <div className="play-setup-panel">
      <h2 className="play-setup-title">Play vs Bot</h2>

      <div className="play-setup-section">
        <label className="play-setup-label">Bot Strength</label>
        <div className="play-setup-elo-display">
          <span className="play-setup-elo-number">{botElo}</span>
          <span className="play-setup-elo-label">— {getEloLabel(botElo)}</span>
        </div>
        <input
          type="range"
          min={500}
          max={3000}
          step={50}
          value={botElo}
          onChange={e => setBotElo(Number(e.target.value))}
          className="play-setup-slider"
        />
        <div className="play-setup-slider-ticks">
          <span>500</span>
          <span>1500</span>
          <span>3000</span>
        </div>
      </div>

      <div className="play-setup-section">
        <label className="play-setup-label">Time Control</label>
        <div className="play-setup-pills">
          {TIME_CONTROLS.map(tc => (
            <button
              key={tc.value}
              className={`play-setup-pill${timeControl === tc.value ? ' active' : ''}`}
              onClick={() => setTimeControl(tc.value)}
            >
              {tc.label}
            </button>
          ))}
        </div>
      </div>

      <div className="play-setup-section">
        <label className="play-setup-label">Bot Speed</label>
        <div className="play-setup-pills">
          {BOT_SPEEDS.map(s => (
            <button
              key={s.value}
              className={`play-setup-pill${botSpeed === s.value ? ' active' : ''}`}
              onClick={() => setBotSpeed(s.value)}
              title={s.hint}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <button className="play-setup-start-btn" onClick={handleStart} disabled={!engineReady}>
        {engineReady ? 'Start Game' : 'Loading engine…'}
      </button>
    </div>
  )
}
