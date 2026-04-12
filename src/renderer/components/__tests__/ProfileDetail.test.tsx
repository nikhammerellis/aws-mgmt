import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProfileDetail } from '../ProfileDetail'
import type { AwsProfile, ProfileTestResult, SamlProfile } from '../../types'

const baseProfile: AwsProfile = {
  name: 'dev',
  isActive: false,
  region: 'us-west-2',
  output: 'json',
  hasCredentials: true,
  accessKeyId: 'AKIA',
  secretAccessKey: 'secret'
}

function noop() {
  /* no-op */
}

interface Options {
  profile?: AwsProfile | null
  samlSources?: SamlProfile[]
  onDuplicate?: (p: AwsProfile) => void
  onNavigateToSaml?: (name: string) => void
}

function renderDetail(opts: Options = {}) {
  const onDuplicate = opts.onDuplicate ?? vi.fn()
  const onNavigateToSaml = opts.onNavigateToSaml ?? vi.fn()
  return {
    onDuplicate,
    onNavigateToSaml,
    ...render(
      <ProfileDetail
        profile={opts.profile ?? baseProfile}
        samlSources={opts.samlSources ?? []}
        expiry={null}
        onEdit={noop}
        onDelete={noop}
        onRename={noop}
        onDuplicate={onDuplicate}
        onLogin={noop}
        onNavigateToSaml={onNavigateToSaml}
      />
    )
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProfileDetail SAML sources', () => {
  it('hides the SAML Sources section when there are no sources', () => {
    renderDetail()
    expect(screen.queryByText(/SAML Sources/i)).not.toBeInTheDocument()
  })

  it('renders one button per SAML source with provider/username metadata', () => {
    const sources: SamlProfile[] = [
      { name: 'work-okta', provider: 'Okta', username: 'me@example.com' },
      { name: 'home-google', provider: 'GoogleApps' }
    ]
    renderDetail({ samlSources: sources })

    expect(screen.getByText('SAML Sources')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /work-okta/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /home-google/ })).toBeInTheDocument()
  })

  it('calls onNavigateToSaml with the SAML profile name on click', () => {
    const sources: SamlProfile[] = [{ name: 'work-okta', provider: 'Okta' }]
    const { onNavigateToSaml } = renderDetail({ samlSources: sources })

    fireEvent.click(screen.getByRole('button', { name: /work-okta/ }))
    expect(onNavigateToSaml).toHaveBeenCalledWith('work-okta')
  })
})

describe('ProfileDetail Duplicate button', () => {
  it('calls onDuplicate with the current profile', () => {
    const { onDuplicate } = renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(onDuplicate).toHaveBeenCalledWith(baseProfile)
  })
})

describe('ProfileDetail Test button', () => {
  it('renders a success panel when testProfile resolves ok', async () => {
    window.api.testProfile = vi.fn().mockResolvedValue({
      ok: true,
      account: '123456789012',
      arn: 'arn:aws:iam::123456789012:user/me',
      userId: 'AIDAEXAMPLE'
    } satisfies ProfileTestResult)

    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))

    await waitFor(() => {
      expect(screen.getByText(/Profile is alive/)).toBeInTheDocument()
    })
    expect(screen.getByText('123456789012')).toBeInTheDocument()
    expect(screen.getByText('arn:aws:iam::123456789012:user/me')).toBeInTheDocument()
  })

  it('renders a failure panel with the hint when testProfile returns an error', async () => {
    window.api.testProfile = vi.fn().mockResolvedValue({
      ok: false,
      error: 'Credentials expired or invalid',
      hint: 'Re-run your login'
    } satisfies ProfileTestResult)

    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))

    await waitFor(() => {
      expect(screen.getByText(/Credentials expired or invalid/)).toBeInTheDocument()
    })
    expect(screen.getByText('Re-run your login')).toBeInTheDocument()
  })

  it('clears the test result when switching to a different profile', async () => {
    window.api.testProfile = vi.fn().mockResolvedValue({
      ok: true,
      account: '111',
      arn: 'arn',
      userId: 'id'
    } satisfies ProfileTestResult)

    const { rerender } = renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))

    await waitFor(() => {
      expect(screen.getByText(/Profile is alive/)).toBeInTheDocument()
    })

    rerender(
      <ProfileDetail
        profile={{ ...baseProfile, name: 'other' }}
        samlSources={[]}
        expiry={null}
        onEdit={noop}
        onDelete={noop}
        onRename={noop}
        onDuplicate={noop}
        onLogin={noop}
        onNavigateToSaml={noop}
      />
    )

    expect(screen.queryByText(/Profile is alive/)).not.toBeInTheDocument()
  })
})
