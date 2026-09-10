import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { Header } from '../Header'
import type { ActiveContext, AwsProfile } from '../../types'

beforeEach(() => {
  vi.clearAllMocks()
  document.title = ''
})

function makeProfile(over: Partial<AwsProfile> = {}): AwsProfile {
  return {
    name: 'dev',
    isActive: true,
    isLive: true,
    region: 'us-west-2',
    hasCredentials: true,
    ...over
  }
}

function makeContext(over: Partial<ActiveContext> = {}): ActiveContext {
  return {
    liveProfiles: [],
    staticProfiles: [],
    shellProfile: null,
    machineDefault: null,
    contextProfile: null,
    effective: null,
    machineDefaultStale: false,
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

  describe('refresh button', () => {
    it('does not render when no onRefresh handler is provided', () => {
      render(<Header activeProfile={null} />)
      expect(screen.queryByLabelText('Refresh')).not.toBeInTheDocument()
    })

    it('renders and fires onRefresh when clicked', () => {
      const onRefresh = vi.fn()
      render(<Header activeProfile={null} onRefresh={onRefresh} />)
      const btn = screen.getByLabelText('Refresh')
      fireEvent.click(btn)
      expect(onRefresh).toHaveBeenCalledTimes(1)
    })

    it('disables the button while refreshing', () => {
      const onRefresh = vi.fn()
      render(<Header activeProfile={null} onRefresh={onRefresh} refreshing />)
      const btn = screen.getByLabelText('Refresh')
      expect(btn).toBeDisabled()
      fireEvent.click(btn)
      expect(onRefresh).not.toHaveBeenCalled()
    })

    it('applies the spin class while refreshing', () => {
      const { rerender } = render(
        <Header activeProfile={null} onRefresh={vi.fn()} refreshing={false} />
      )
      expect(screen.getByLabelText('Refresh').className).not.toMatch(/is-refreshing/)
      rerender(<Header activeProfile={null} onRefresh={vi.fn()} refreshing />)
      expect(screen.getByLabelText('Refresh').className).toMatch(/is-refreshing/)
    })
  })

  // These branches had no coverage at all: every prior test omitted
  // activeContext, so the whole live/stale/static header was untested.
  describe('live vs selected', () => {
    it('says "Live:" and marks the badge live when the profile holds a session', () => {
      render(
        <Header
          activeProfile={makeProfile({ name: 'logistics', isLive: true })}
          activeContext={makeContext({ liveProfiles: ['logistics'], effective: 'logistics' })}
        />
      )

      expect(screen.getByText('Live:')).toBeInTheDocument()
      expect(screen.getByLabelText('Live profile')).toBeInTheDocument()
      expect(screen.queryByText('not logged in')).not.toBeInTheDocument()
    })

    it('says "Selected:" and warns when the chosen profile has no session', () => {
      render(
        <Header
          activeProfile={makeProfile({ name: 'logistics', isLive: false })}
          activeContext={makeContext({ liveProfiles: ['saml'], effective: 'logistics' })}
        />
      )

      expect(screen.getByText('Selected:')).toBeInTheDocument()
      expect(screen.getByText('not logged in')).toBeInTheDocument()
      expect(screen.getByLabelText('Selected profile, not logged in')).toBeInTheDocument()
    })

    it('calls long-lived IAM keys static rather than "not logged in"', () => {
      render(
        <Header
          activeProfile={makeProfile({ name: 'analytics-keys', isLive: false, isStatic: true })}
          activeContext={makeContext({ staticProfiles: ['analytics-keys'], effective: 'analytics-keys' })}
        />
      )

      expect(screen.getByText('static keys')).toBeInTheDocument()
      expect(screen.queryByText('not logged in')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Selected profile, static IAM keys')).toBeInTheDocument()
    })

    it('counts the other live sessions after a fan-out login', () => {
      render(
        <Header
          activeProfile={makeProfile({ name: 'logistics', isLive: true })}
          activeContext={makeContext({
            liveProfiles: ['logistics', 'logistics-prod', 'vision'],
            effective: 'logistics'
          })}
        />
      )

      expect(screen.getByText('+2 more live')).toBeInTheDocument()
    })

    it('reports live sessions when none is selected', () => {
      render(
        <Header
          activeProfile={null}
          activeContext={makeContext({ liveProfiles: ['logistics', 'vision'] })}
        />
      )

      expect(screen.getByText('2 live session(s), none selected')).toBeInTheDocument()
      expect(screen.queryByText(/more live/)).not.toBeInTheDocument()
    })

    it('surfaces a stale machine default', () => {
      render(
        <Header
          activeProfile={makeProfile({ name: 'logistics', isLive: true })}
          activeContext={makeContext({
            liveProfiles: ['logistics'],
            machineDefault: 'default',
            machineDefaultStale: true,
            effective: 'logistics'
          })}
        />
      )

      expect(screen.getByText(/stale default:/)).toBeInTheDocument()
    })
  })
})
