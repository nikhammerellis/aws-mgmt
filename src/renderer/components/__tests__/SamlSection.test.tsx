import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SamlSection } from '../SamlSection'
import type { SamlProfile } from '../../types'

function makeSaml(overrides: Partial<SamlProfile> = {}): SamlProfile {
  return { name: 'work-okta', provider: 'Okta', awsProfile: 'dev', ...overrides }
}

interface RenderOptions {
  profiles?: SamlProfile[]
  awsProfileNames?: Set<string>
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
    awsProfileNames: options.awsProfileNames ?? new Set(['dev']),
    onSelect: options.onSelect ?? vi.fn(),
    onAdd: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onNavigateToAws: options.onNavigateToAws ?? vi.fn()
  }
  return { props, ...render(<SamlSection {...props} />) }
}

describe('SamlSection AWS link badge', () => {
  it('renders the AWS link with the explicit awsProfile target', () => {
    renderSection()
    const link = screen.getByRole('button', { name: /AWS: dev/ })
    expect(link).toBeInTheDocument()
    expect(link.className).not.toContain('missing')
  })

  it('falls back to the SAML section name when awsProfile is blank', () => {
    renderSection({
      profiles: [makeSaml({ awsProfile: '' })],
      awsProfileNames: new Set(['work-okta'])
    })
    const link = screen.getByRole('button', { name: /AWS: work-okta/ })
    expect(link).toBeInTheDocument()
    expect(screen.getByText(/\(default\)/)).toBeInTheDocument()
  })

  it('marks the link as missing when the target AWS profile does not exist', () => {
    renderSection({
      profiles: [makeSaml({ awsProfile: 'ghost' })],
      awsProfileNames: new Set(['dev'])
    })
    const link = screen.getByRole('button', { name: /AWS: ghost/ })
    expect(link.className).toContain('missing')
    expect(screen.getByText(/\(missing\)/)).toBeInTheDocument()
  })

  it('calls onNavigateToAws with the effective target on click', () => {
    const onNavigateToAws = vi.fn()
    renderSection({ onNavigateToAws })

    fireEvent.click(screen.getByRole('button', { name: /AWS: dev/ }))
    expect(onNavigateToAws).toHaveBeenCalledWith('dev')
  })

  it('does not propagate the AWS link click to the card select handler', () => {
    const onSelect = vi.fn()
    const onNavigateToAws = vi.fn()
    renderSection({ onSelect, onNavigateToAws })

    fireEvent.click(screen.getByRole('button', { name: /AWS: dev/ }))
    expect(onNavigateToAws).toHaveBeenCalledOnce()
    expect(onSelect).not.toHaveBeenCalled()
  })
})
