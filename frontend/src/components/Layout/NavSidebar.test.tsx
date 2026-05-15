import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import NavSidebar from './NavSidebar'

vi.mock('../Auth/UserMenu', () => ({
  default: () => <div data-testid="user-menu" />,
}))

describe('NavSidebar', () => {
  it('shows Settings above Profile in the desktop sidebar', () => {
    render(<NavSidebar currentPage="review" onNavigate={vi.fn()} />)

    const settings = screen.getByText('Settings')
    const profile = screen.getByText('Profile')

    expect(settings).toBeInTheDocument()
    expect(profile).toBeInTheDocument()
    expect(settings.compareDocumentPosition(profile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
