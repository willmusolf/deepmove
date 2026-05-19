import { describe, expect, it } from 'vitest'
import css from './board.css?raw'

describe('mobile input zoom guard', () => {
  it('keeps the final mobile input override at 16px', () => {
    const finalMobileCss = css.slice(-1200)
    expect(finalMobileCss).toContain('@media (max-width: 767px)')
    expect(finalMobileCss).toContain('.account-link-input')
    expect(finalMobileCss).toContain('.game-opponent-search')
    expect(finalMobileCss).toContain('.game-sort-select')
    expect(finalMobileCss).toContain('.fen-input')
    expect(finalMobileCss).toContain('.import-textarea')
    expect(finalMobileCss).toContain('.auth-input')
    expect(finalMobileCss).toContain('.profile-input')
    expect(finalMobileCss).toContain('font-size: 16px;')
  })
})
