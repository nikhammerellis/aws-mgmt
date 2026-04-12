import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ProfileList } from '../ProfileList'
import type { AwsProfile, SamlProfile } from '../../types'
import type { ExpiryStatus } from '../../hooks/useProfileExpiries'

const profiles: AwsProfile[] = [
  { name: 'default', isActive: true, region: 'us-east-1', hasCredentials: true },
  { name: 'dev', isActive: false, region: 'us-west-2', roleArn: 'arn:aws:iam::1:role/Dev', hasCredentials: true },
  { name: 'staging', isActive: false, region: 'eu-west-1', hasCredentials: false },
  { name: 'prod', isActive: false, region: 'ap-southeast-1', sourceProfile: 'dev', hasCredentials: false }
]

interface RenderOpts {
  profiles?: AwsProfile[]
  samlSourcesByAws?: Map<string, SamlProfile[]>
  onSwitch?: (name: string) => void
  onRename?: (p: AwsProfile) => void
  onDelete?: (name: string) => void
}

function renderList(opts: RenderOpts = {}) {
  const props = {
    profiles: opts.profiles ?? profiles,
    loading: false,
    selectedName: null,
    samlSourcesByAws: opts.samlSourcesByAws ?? new Map<string, SamlProfile[]>(),
    shellHint: null,
    expiries: new Map<string, ExpiryStatus>(),
    onSelect: vi.fn(),
    onSwitch: opts.onSwitch ?? vi.fn(),
    onAdd: vi.fn(),
    onRename: opts.onRename ?? vi.fn(),
    onDelete: opts.onDelete ?? vi.fn(),
    onLaunchTerminal: vi.fn(),
    onLogin: vi.fn(),
    onCopyFeedback: vi.fn()
  }
  return { props, ...render(<ProfileList {...props} />) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProfileList search', () => {
  it('renders all profiles when query is empty', () => {
    renderList()
    expect(screen.getByText('default')).toBeInTheDocument()
    expect(screen.getByText('dev')).toBeInTheDocument()
    expect(screen.getByText('staging')).toBeInTheDocument()
    expect(screen.getByText('prod')).toBeInTheDocument()
  })

  it('filters by name substring (case-insensitive)', () => {
    renderList()
    fireEvent.change(screen.getByLabelText('Filter profiles'), { target: { value: 'PR' } })

    expect(screen.getByText('prod')).toBeInTheDocument()
    expect(screen.queryByText('default')).not.toBeInTheDocument()
    expect(screen.queryByText('dev')).not.toBeInTheDocument()
    expect(screen.queryByText('staging')).not.toBeInTheDocument()
  })

  it('filters by region', () => {
    renderList()
    fireEvent.change(screen.getByLabelText('Filter profiles'), { target: { value: 'eu-west' } })

    expect(screen.getByText('staging')).toBeInTheDocument()
    expect(screen.queryByText('default')).not.toBeInTheDocument()
  })

  it('filters by role ARN', () => {
    renderList()
    fireEvent.change(screen.getByLabelText('Filter profiles'), { target: { value: 'role/dev' } })

    expect(screen.getByText('dev')).toBeInTheDocument()
    expect(screen.queryByText('staging')).not.toBeInTheDocument()
  })

  it('shows the no-matches empty state', () => {
    renderList()
    fireEvent.change(screen.getByLabelText('Filter profiles'), { target: { value: 'nonexistent' } })

    expect(screen.getByText(/No matches for "nonexistent"/)).toBeInTheDocument()
  })

  it('clear button resets the query', () => {
    renderList()
    const input = screen.getByLabelText('Filter profiles') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'dev' } })
    expect(input.value).toBe('dev')

    fireEvent.click(screen.getByLabelText('Clear search'))
    expect(input.value).toBe('')
    expect(screen.getByText('default')).toBeInTheDocument()
  })
})

describe('ProfileList keyboard navigation', () => {
  it('Arrow Down focuses the next card and calls onSelect', () => {
    const { props } = renderList()
    const list = screen.getByRole('listbox', { name: 'AWS profiles' })

    fireEvent.keyDown(list, { key: 'ArrowDown' })
    // First arrow key picks the first card (default)
    expect(props.onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'default' })
    )

    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(props.onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'dev' })
    )
  })

  it('Enter on a focused inactive card calls onSwitch', () => {
    const onSwitch = vi.fn()
    renderList({ onSwitch })
    const list = screen.getByRole('listbox', { name: 'AWS profiles' })

    fireEvent.keyDown(list, { key: 'ArrowDown' }) // default (active)
    fireEvent.keyDown(list, { key: 'ArrowDown' }) // dev
    fireEvent.keyDown(list, { key: 'Enter' })

    expect(onSwitch).toHaveBeenCalledWith('dev')
  })

  it('Enter on the active profile is a no-op', () => {
    const onSwitch = vi.fn()
    renderList({ onSwitch })
    const list = screen.getByRole('listbox', { name: 'AWS profiles' })

    fireEvent.keyDown(list, { key: 'ArrowDown' }) // default (active)
    fireEvent.keyDown(list, { key: 'Enter' })

    expect(onSwitch).not.toHaveBeenCalled()
  })

  it('F2 calls onRename for the focused profile', () => {
    const onRename = vi.fn()
    renderList({ onRename })
    const list = screen.getByRole('listbox', { name: 'AWS profiles' })

    fireEvent.keyDown(list, { key: 'ArrowDown' }) // default
    fireEvent.keyDown(list, { key: 'F2' })

    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ name: 'default' }))
  })

  it('Delete calls onDelete for the focused profile', () => {
    const onDelete = vi.fn()
    renderList({ onDelete })
    const list = screen.getByRole('listbox', { name: 'AWS profiles' })

    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'Delete' })

    expect(onDelete).toHaveBeenCalledWith('dev')
  })

  it('Home and End jump to the ends', () => {
    const { props } = renderList()
    const list = screen.getByRole('listbox', { name: 'AWS profiles' })

    fireEvent.keyDown(list, { key: 'End' })
    expect(props.onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'prod' })
    )

    fireEvent.keyDown(list, { key: 'Home' })
    expect(props.onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'default' })
    )
  })

  it('search still filters which profiles can be navigated', () => {
    const onSwitch = vi.fn()
    renderList({ onSwitch })
    fireEvent.change(screen.getByLabelText('Filter profiles'), { target: { value: 'prod' } })

    const list = screen.getByRole('listbox', { name: 'AWS profiles' })
    // Only one match, so just check it exists
    expect(within(list).getByText('prod')).toBeInTheDocument()
    expect(within(list).queryByText('dev')).not.toBeInTheDocument()
  })
})
