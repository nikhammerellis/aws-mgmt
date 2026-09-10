import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SamlSection } from '../SamlSection'
import type { AwsProfile, SamlProfile } from '../../types'

function makeSaml(overrides: Partial<SamlProfile> = {}): SamlProfile {
  return { name: 'work-okta', provider: 'Okta', awsProfile: 'dev', ...overrides }
}

function makeAws(name: string, overrides: Partial<AwsProfile> = {}): AwsProfile {
  return { name, isActive: false, isLive: false, hasCredentials: false, ...overrides }
}

interface RenderOptions {
  profiles?: SamlProfile[]
  awsProfiles?: AwsProfile[]
  selectedName?: string | null
  onNavigateToAws?: (name: string) => void
  onSelect?: (name: string | null) => void
}

function renderSection(options: RenderOptions = {}) {
  const props = {
    profiles: options.profiles ?? [makeSaml()],
    loading: false,
    error: null,
    selectedName: options.selectedName ?? null,
    awsProfiles: options.awsProfiles ?? [makeAws('dev')],
    onSelect: options.onSelect ?? vi.fn(),
    onAdd: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onNavigateToAws: options.onNavigateToAws ?? vi.fn()
  }
  return { props, ...render(<SamlSection {...props} />) }
}

describe('SamlSection default write target', () => {
  it('renders the link with the explicit awsProfile target', () => {
    renderSection()
    const link = screen.getByRole('button', { name: /→ dev/ })
    expect(link).toBeInTheDocument()
    expect(link.className).not.toContain('missing')
  })

  it('falls back to the SAML section name when awsProfile is blank', () => {
    renderSection({
      profiles: [makeSaml({ awsProfile: '' })],
      awsProfiles: [makeAws('work-okta')]
    })
    expect(screen.getByRole('button', { name: /→ work-okta/ })).toBeInTheDocument()
    expect(screen.getByText(/\(default\)/)).toBeInTheDocument()
  })

  it('marks the link as missing when the target AWS profile does not exist', () => {
    renderSection({
      profiles: [makeSaml({ awsProfile: 'ghost' })],
      awsProfiles: [makeAws('dev')]
    })
    const link = screen.getByRole('button', { name: /→ ghost/ })
    expect(link.className).toContain('missing')
    expect(screen.getByText(/\(missing\)/)).toBeInTheDocument()
  })

  it('calls onNavigateToAws with the effective target on click', () => {
    const onNavigateToAws = vi.fn()
    renderSection({ onNavigateToAws })

    fireEvent.click(screen.getByRole('button', { name: /→ dev/ }))
    expect(onNavigateToAws).toHaveBeenCalledWith('dev')
  })

  it('does not propagate the link click to the card select handler', () => {
    const onSelect = vi.fn()
    const onNavigateToAws = vi.fn()
    renderSection({ onSelect, onNavigateToAws })

    fireEvent.click(screen.getByRole('button', { name: /→ dev/ }))
    expect(onNavigateToAws).toHaveBeenCalledOnce()
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('SamlSection identity-provider framing', () => {
  it('classifies a block with no role of its own as fan-out', () => {
    renderSection({ profiles: [makeSaml({ roleArn: '' })] })
    expect(screen.getByText('Fan-out')).toBeInTheDocument()
  })

  it('classifies a block that names a role as pinned', () => {
    renderSection({
      profiles: [makeSaml({ roleArn: 'arn:aws:iam::123456789012:role/OnlyThisOne' })]
    })
    expect(screen.getByText('Pinned to one role')).toBeInTheDocument()
    // The fan-out target list belongs only to a provider that can fan out.
    expect(
      screen.queryByText(/Profiles that can log in through this provider/)
    ).not.toBeInTheDocument()
  })

  it('lists the AWS profiles that can authenticate through a fan-out provider', () => {
    renderSection({
      profiles: [makeSaml({ awsProfile: 'saml', roleArn: '' })],
      awsProfiles: [
        makeAws('saml'),
        makeAws('logistics', { samlRoleArn: 'arn:aws:iam::111111111111:role/Admin' }),
        makeAws('vision', { samlRoleArn: 'arn:aws:iam::444444444444:role/Admin' }),
        // No role resolved — cannot log in through the provider, so it is
        // deliberately absent rather than listed and broken.
        makeAws('static-keys')
      ]
    })

    expect(screen.getByText(/Profiles that can log in through this provider/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'logistics' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'vision' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'static-keys' })).not.toBeInTheDocument()
  })

  it('says so plainly when no profile can use the provider yet', () => {
    renderSection({
      profiles: [makeSaml({ roleArn: '' })],
      awsProfiles: [makeAws('dev')]
    })
    expect(screen.getByText(/None yet/)).toBeInTheDocument()
  })

  it('navigates to a fan-out target when its chip is clicked', () => {
    const onNavigateToAws = vi.fn()
    renderSection({
      profiles: [makeSaml({ roleArn: '' })],
      awsProfiles: [
        makeAws('dev'),
        makeAws('logistics', { samlRoleArn: 'arn:aws:iam::111111111111:role/Admin' })
      ],
      onNavigateToAws
    })

    fireEvent.click(screen.getByRole('button', { name: 'logistics' }))
    expect(onNavigateToAws).toHaveBeenCalledWith('logistics')
  })

  it('reports an empty ~/.saml2aws as having no way to log in', () => {
    renderSection({ profiles: [] })
    expect(screen.getByText('No identity providers found')).toBeInTheDocument()
  })
})
