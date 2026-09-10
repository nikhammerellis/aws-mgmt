import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProfileCard } from '../ProfileCard'
import type { ExpiryStatus } from '../../hooks/useProfileExpiries'
import type { AwsProfile, ShellHint } from '../../types'

const baseProfile: AwsProfile = {
  name: 'dev',
  isActive: false, isLive: false,
  region: 'us-west-2',
  hasCredentials: true
}

const bashHint: ShellHint = {
  flavor: 'bash',
  exportLineTemplate: 'export AWS_PROFILE=__PROFILE__'
}

const pwshHint: ShellHint = {
  flavor: 'pwsh',
  exportLineTemplate: '$env:AWS_PROFILE = "__PROFILE__"'
}

const writeText = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true
  })
})

interface RenderOpts {
  profile?: AwsProfile
  shellHint?: ShellHint | null
  expiry?: ExpiryStatus | null
  onSwitch?: () => void
  onLaunchTerminal?: (name: string) => void
  onCopyFeedback?: (msg: string) => void
}

function renderCard(opts: RenderOpts = {}) {
  const props = {
    profile: opts.profile ?? baseProfile,
    isSelected: false,
    isFocused: false,
    samlSources: [],
    samlProviders: [],
    shellHint: opts.shellHint ?? bashHint,
    expiry: opts.expiry ?? null,
    onSelect: vi.fn(),
    onSwitch: opts.onSwitch ?? vi.fn(),
    onLaunchTerminal: opts.onLaunchTerminal ?? vi.fn(),
    onLogin: vi.fn(),
    onCopyFeedback: opts.onCopyFeedback ?? vi.fn()
  }
  return { props, ...render(<ProfileCard {...props} />) }
}

describe('ProfileCard split-button', () => {
  it('renders the Switch button as the primary action for inactive profiles', () => {
    renderCard()
    expect(screen.getByRole('button', { name: /^switch$/i })).toBeInTheDocument()
  })

  it('hides the Switch button on the active profile but keeps the dropdown', () => {
    renderCard({ profile: { ...baseProfile, isActive: true } })
    expect(screen.queryByRole('button', { name: /^switch$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /more actions for dev/i })).toBeInTheDocument()
  })

  it('opens the dropdown menu when the caret is clicked', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /more actions for dev/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Copy export/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Launch new terminal/i })).toBeInTheDocument()
  })

  it('closes the dropdown when Escape is pressed', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('copies the bash-flavored export line to the clipboard', async () => {
    const onCopyFeedback = vi.fn()
    renderCard({ onCopyFeedback })
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Copy export/i }))

    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith('export AWS_PROFILE=dev')
    await Promise.resolve()
    expect(onCopyFeedback).toHaveBeenCalledWith('Copied: export AWS_PROFILE=dev')
  })

  it('uses the PowerShell template when the shell hint is pwsh', async () => {
    renderCard({ shellHint: pwshHint })
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Copy export/i }))

    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith('$env:AWS_PROFILE = "dev"')
  })

  it('calls onLaunchTerminal with the profile name', () => {
    const onLaunchTerminal = vi.fn()
    renderCard({ onLaunchTerminal })
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Launch new terminal/i }))

    expect(onLaunchTerminal).toHaveBeenCalledWith('dev')
  })

  it('renders the STS-creds menu item disabled with the Phase C hint', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    const stsItem = screen.getByRole('menuitem', { name: /Copy temporary STS creds/i })
    expect(stsItem).toBeDisabled()
  })

  it('renders Login (n/a) for static IAM keys profiles', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    const item = screen.getByRole('menuitem', { name: /Login \(not applicable\)/i })
    expect(item).toBeDisabled()
  })

  it('enables and dispatches the SSO login menu item', () => {
    const onLogin = vi.fn()
    render(
      <ProfileCard
        profile={{
          name: 'sso-dev',
          isActive: false, isLive: false,
          hasCredentials: false,
          ssoStartUrl: 'https://example.awsapps.com/start'
        }}
        isSelected={false}
        isFocused={false}
        samlSources={[]}
        samlProviders={[]}
        shellHint={bashHint}
        expiry={null}
        onSelect={vi.fn()}
        onSwitch={vi.fn()}
        onLaunchTerminal={vi.fn()}
        onLogin={onLogin}
        onCopyFeedback={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Login via aws sso/i }))

    expect(onLogin).toHaveBeenCalledWith({ kind: 'sso', profileName: 'sso-dev' })
  })

  it('uses the SAML source when one targets the profile', () => {
    const onLogin = vi.fn()
    render(
      <ProfileCard
        profile={{ name: 'work', isActive: false, isLive: false, hasCredentials: true }}
        isSelected={false}
        isFocused={false}
        samlSources={[{ name: 'work-okta', provider: 'Okta' }]}
        samlProviders={[{ name: 'work-okta', provider: 'Okta' }]}
        shellHint={bashHint}
        expiry={null}
        onSelect={vi.fn()}
        onSwitch={vi.fn()}
        onLaunchTerminal={vi.fn()}
        onLogin={onLogin}
        onCopyFeedback={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Login via saml2aws/i }))

    expect(onLogin).toHaveBeenCalledWith({
      kind: 'saml-target',
      profileName: 'work',
      samlSection: 'work-okta',
      hasRoleArn: false
    })
  })
})

describe('ProfileCard live session identity', () => {
  const liveExpiry: ExpiryStatus = {
    expiresAt: new Date('2030-06-01T00:00:00Z'),
    remainingMs: 2 * 60 * 60_000,
    severity: 'fresh',
    source: 'saml2aws',
    account: '333333333333',
    region: 'us-east-1',
    role: 'Admin-Konnect'
  }

  it('shows the live account and assumed-role from an active session', () => {
    renderCard({ expiry: liveExpiry })
    expect(screen.getByText(/333333333333/)).toBeInTheDocument()
    expect(screen.getByText('Admin-Konnect')).toBeInTheDocument()
  })

  it('shows the live region with the configured default in the tooltip', () => {
    // baseProfile is configured for us-west-2; the live session is us-east-1
    renderCard({ expiry: liveExpiry })
    const live = screen.getByText('us-east-1')
    expect(live).toBeInTheDocument()
    expect(live).toHaveAttribute('title', expect.stringContaining('us-west-2'))
    expect(screen.queryByText('us-west-2')).not.toBeInTheDocument()
  })

  it('falls back to the configured region when no live session is present', () => {
    renderCard({ expiry: null })
    const region = screen.getByText('us-west-2')
    expect(region).toBeInTheDocument()
    expect(region).not.toHaveAttribute('title')
  })

  it('does not render an account or role tag without a live session', () => {
    renderCard({ expiry: null })
    expect(screen.queryByText(/333333333333/)).not.toBeInTheDocument()
    expect(screen.queryByText('Admin-Konnect')).not.toBeInTheDocument()
  })
})
