import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import NavSidebar from './NavSidebar'

vi.mock('../Auth/UserMenu', () => ({
  default: () => <div data-testid="user-menu">Account</div>,
}))

describe('NavSidebar', () => {
  it('keeps profile access in the user menu instead of a duplicate sidebar tab', () => {
    render(<NavSidebar currentPage="review" onNavigate={vi.fn()} />)

    const settings = screen.getByText('Settings')
    const account = screen.getByText('Account')

    expect(settings).toBeInTheDocument()
    expect(account).toBeInTheDocument()
    expect(screen.queryByText('Profile')).not.toBeInTheDocument()
    expect(settings.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('routes the logo to review', () => {
    const onNavigate = vi.fn()
    render(<NavSidebar currentPage="about" onNavigate={onNavigate} />)

    fireEvent.click(screen.getByTitle('Go to Review'))

    expect(onNavigate).toHaveBeenCalledWith('review')
  })
})
