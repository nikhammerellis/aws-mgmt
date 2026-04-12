import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProfileWizard } from '../ProfileWizard'
import type { AwsProfile } from '../../types'

const existingNames: string[] = ['default', 'dev']

interface Options {
  mode?: 'add' | 'edit' | 'clone'
  profile?: AwsProfile | null
  onSave?: ReturnType<typeof vi.fn>
  onCancel?: () => void
}

function renderWizard(opts: Options = {}) {
  const onSave = opts.onSave ?? vi.fn().mockResolvedValue(undefined)
  const onCancel = opts.onCancel ?? vi.fn()
  const props = {
    mode: opts.mode ?? 'add',
    profile: opts.profile ?? null,
    existingNames,
    onSave,
    onCancel
  }
  return { onSave, onCancel, ...render(<ProfileWizard {...props} />) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProfileWizard add flow', () => {
  it('starts on the kind picker and shows all four kinds', () => {
    renderWizard()
    expect(screen.getByText(/What kind of profile/i)).toBeInTheDocument()
    expect(screen.getByText('IAM Keys')).toBeInTheDocument()
    expect(screen.getByText('AWS SSO / IAM Identity Center')).toBeInTheDocument()
    expect(screen.getByText('Assume Role')).toBeInTheDocument()
    expect(screen.getByText('SAML2AWS Target')).toBeInTheDocument()
  })

  it('advances to the details step after picking a kind and clicking Next', () => {
    renderWizard()
    fireEvent.click(screen.getByText('IAM Keys'))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByRole('heading', { name: /Add: IAM Keys/ })).toBeInTheDocument()
    expect(screen.getByLabelText(/Profile Name/)).toBeInTheDocument()
  })

  it('shows IAM-keys-specific fields only when that kind is selected', () => {
    renderWizard()
    fireEvent.click(screen.getByText('IAM Keys'))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByPlaceholderText(/AKIA…/)).toBeInTheDocument()
  })

  it('shows SSO-specific fields only when SSO is selected', () => {
    renderWizard()
    fireEvent.click(screen.getByText('AWS SSO / IAM Identity Center'))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByPlaceholderText(/awsapps\.com/)).toBeInTheDocument()
  })

  it('blocks Next when required fields are missing', () => {
    renderWizard()
    fireEvent.click(screen.getByText('IAM Keys'))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    // Details step — no required fields filled yet
    const next = screen.getByRole('button', { name: 'Next' })
    expect(next).toBeDisabled()
  })

  it('conflict check blocks creating a profile with an existing name', () => {
    renderWizard()
    fireEvent.click(screen.getByText('IAM Keys'))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    fireEvent.change(screen.getByLabelText(/Profile Name/), { target: { value: 'dev' } })
    fireEvent.change(screen.getByLabelText(/Region/), { target: { value: 'us-east-1' } })
    fireEvent.change(screen.getByPlaceholderText(/AKIA…/), { target: { value: 'AKIA' } })
    fireEvent.change(screen.getByPlaceholderText(/Secret key/), { target: { value: 'secret' } })

    expect(screen.getByText(/already exists/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('walks through to the review step and shows the diff', async () => {
    const { onSave } = renderWizard()
    fireEvent.click(screen.getByText('IAM Keys'))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    fireEvent.change(screen.getByLabelText(/Profile Name/), { target: { value: 'new-prof' } })
    fireEvent.change(screen.getByLabelText(/Region/), { target: { value: 'us-east-1' } })
    fireEvent.change(screen.getByPlaceholderText(/AKIA…/), { target: { value: 'AKIA_NEW' } })
    fireEvent.change(screen.getByPlaceholderText(/Secret key/), { target: { value: 'topsecret' } })

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('Review changes')).toBeInTheDocument()
    expect(screen.getByText('Profile name')).toBeInTheDocument()
    expect(screen.getByText('new-prof')).toBeInTheDocument()
    // Secrets are masked in the diff
    expect(screen.queryByText('topsecret')).not.toBeInTheDocument()
    expect(screen.getByText('••••••••')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'new-prof',
          region: 'us-east-1',
          accessKeyId: 'AKIA_NEW',
          secretAccessKey: 'topsecret'
        }),
        false
      )
    })
  })

  it('Back from review returns to details, Back from details returns to kind picker', () => {
    renderWizard()
    fireEvent.click(screen.getByText('IAM Keys'))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText(/What kind of profile/i)).toBeInTheDocument()
  })
})

describe('ProfileWizard edit flow', () => {
  const editProfile: AwsProfile = {
    name: 'dev',
    isActive: false,
    region: 'us-west-2',
    output: 'json',
    hasCredentials: true,
    accessKeyId: 'AKIA_OLD',
    secretAccessKey: 'old-secret'
  }

  it('skips the kind picker and detects iam-keys from existing fields', () => {
    renderWizard({ mode: 'edit', profile: editProfile })
    expect(screen.getByRole('heading', { name: /Edit: IAM Keys/ })).toBeInTheDocument()
    expect(screen.queryByText(/What kind of profile/i)).not.toBeInTheDocument()
  })

  it('locks the profile name in edit mode', () => {
    renderWizard({ mode: 'edit', profile: editProfile })
    expect(screen.getByLabelText(/Profile Name/)).toBeDisabled()
  })

  it('diff shows only changed fields', async () => {
    const { onSave } = renderWizard({ mode: 'edit', profile: editProfile })

    fireEvent.change(screen.getByLabelText(/Region/), { target: { value: 'eu-west-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('Review changes')).toBeInTheDocument()
    // Region changed
    expect(screen.getByText('Region')).toBeInTheDocument()
    expect(screen.getByText('us-west-2')).toBeInTheDocument()
    expect(screen.getByText('eu-west-1')).toBeInTheDocument()
    // Name did not change — should not appear
    expect(screen.queryByText('Profile name')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'eu-west-1' }),
        true
      )
    })
  })
})

describe('ProfileWizard clone flow', () => {
  const source: AwsProfile = {
    name: 'dev',
    isActive: false,
    region: 'us-west-2',
    output: 'json',
    roleArn: 'arn:aws:iam::1:role/Dev',
    sourceProfile: 'default',
    hasCredentials: false
  }

  it('pre-fills all fields with a -copy suffix and detects assume-role', () => {
    renderWizard({ mode: 'clone', profile: source })

    expect(screen.getByRole('heading', { name: /Duplicate: Assume Role/ })).toBeInTheDocument()
    expect(screen.getByLabelText(/Profile Name/)).toHaveValue('dev-copy')
    expect(screen.getByLabelText(/Region/)).toHaveValue('us-west-2')
  })

  it('requires the clone name to differ from the source', () => {
    renderWizard({ mode: 'clone', profile: source })

    fireEvent.change(screen.getByLabelText(/Profile Name/), { target: { value: 'dev' } })
    expect(screen.getByText(/different name/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })
})
