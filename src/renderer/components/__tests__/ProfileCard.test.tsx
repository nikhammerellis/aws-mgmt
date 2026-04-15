import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProfileCard } from '../ProfileCard'
import type { AwsProfile, ShellHint } from '../../types'

const baseProfile: AwsProfile = {
  name: 'dev',
  isActive: false,
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
    shellHint: opts.shellHint ?? bashHint,
    expiry: null,
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
          isActive: false,
          hasCredentials: false,
          ssoStartUrl: 'https://example.awsapps.com/start'
        }}
        isSelected={false}
        isFocused={false}
        samlSources={[]}
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
        profile={{ name: 'work', isActive: false, hasCredentials: true }}
        isSelected={false}
        isFocused={false}
        samlSources={[{ name: 'work-okta', provider: 'Okta' }]}
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
