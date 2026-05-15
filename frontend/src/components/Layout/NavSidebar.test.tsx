import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import NavSidebar from './NavSidebar'

vi.mock('../Auth/UserMenu', () => ({
  default: () => <div data-testid="user-menu" />,
}))

describe('NavSidebar', () => {
  it('always shows the Settings destination', () => {
    render(<NavSidebar currentPage="review" onNavigate={vi.fn()} />)

    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
})
