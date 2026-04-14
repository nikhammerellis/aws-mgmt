import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Header } from '../Header'
import type { AwsProfile } from '../../types'

beforeEach(() => {
  vi.clearAllMocks()
  document.title = ''
})

function makeProfile(over: Partial<AwsProfile> = {}): AwsProfile {
  return {
    name: 'dev',
    isActive: true,
    region: 'us-west-2',
    hasCredentials: true,
    ...over
  }
}

describe('Header', () => {
  it('renders the app name', () => {
    render(<Header activeProfile={null} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('AWS Profile Manager')
  })

  it('renders the version badge once fetched', async () => {
    window.api.getAppVersion = vi.fn().mockResolvedValue('0.2.0')
    render(<Header activeProfile={null} />)
    await waitFor(() => expect(screen.getByText('v0.2.0')).toBeInTheDocument())
  })

  it('syncs document.title with the version', async () => {
    window.api.getAppVersion = vi.fn().mockResolvedValue('1.2.3')
    render(<Header activeProfile={null} />)
    await waitFor(() => expect(document.title).toBe('AWS Profile Manager 1.2.3'))
  })

  it('shows active profile name and region when one is set', () => {
    render(<Header activeProfile={makeProfile({ name: 'prod', region: 'eu-west-1' })} />)
    expect(screen.getByText('prod')).toBeInTheDocument()
    expect(screen.getByText('(eu-west-1)')).toBeInTheDocument()
  })

  it('shows the no-active state when nothing is set', () => {
    render(<Header activeProfile={null} />)
    expect(screen.getByText('No active profile')).toBeInTheDocument()
  })

  it('does not crash when getAppVersion rejects — leaves title unchanged', async () => {
    document.title = 'preset'
    window.api.getAppVersion = vi.fn().mockRejectedValue(new Error('ipc down'))
    render(<Header activeProfile={null} />)
    // Let the promise settle
    await new Promise((r) => setTimeout(r, 0))
    expect(document.title).toBe('preset')
    expect(screen.queryByText(/^v/)).not.toBeInTheDocument()
  })
})
