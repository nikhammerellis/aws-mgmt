import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommandPalette, type CommandPaletteAction } from '../CommandPalette'
import type { AwsProfile } from '../../types'

const profiles: AwsProfile[] = [
  { name: 'default', isActive: true, hasCredentials: true },
  { name: 'dev', isActive: false, hasCredentials: true }
]

function makeActions(runs: Record<string, ReturnType<typeof vi.fn>> = {}): CommandPaletteAction[] {
  return [
    {
      id: 'switch-dev',
      label: 'Switch to dev',
      group: 'Switch profile',
      hint: 'us-west-2',
      run: runs['switch-dev'] ?? vi.fn()
    },
    {
      id: 'copy-dev',
      label: 'Copy export for dev',
      group: 'Terminal',
      run: runs['copy-dev'] ?? vi.fn()
    },
    {
      id: 'rename-dev',
      label: 'Rename dev',
      group: 'Manage profile',
      run: runs['rename-dev'] ?? vi.fn()
    },
    {
      id: 'delete-dev',
      label: 'Delete dev',
      group: 'Manage profile',
      disabled: true,
      run: runs['delete-dev'] ?? vi.fn()
    }
  ]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CommandPalette', () => {
  it('renders all actions grouped by their group label', () => {
    const onClose = vi.fn()
    render(
      <CommandPalette profiles={profiles} actions={makeActions()} onClose={onClose} />
    )

    expect(screen.getByText('Switch profile')).toBeInTheDocument()
    expect(screen.getByText('Terminal')).toBeInTheDocument()
    expect(screen.getByText('Manage profile')).toBeInTheDocument()
    expect(screen.getByText('Switch to dev')).toBeInTheDocument()
    expect(screen.getByText('Copy export for dev')).toBeInTheDocument()
  })

  it('filters actions by substring match', () => {
    render(
      <CommandPalette profiles={profiles} actions={makeActions()} onClose={vi.fn()} />
    )

    fireEvent.change(screen.getByLabelText('Command palette search'), {
      target: { value: 'rename' }
    })

    expect(screen.getByText('Rename dev')).toBeInTheDocument()
    expect(screen.queryByText('Switch to dev')).not.toBeInTheDocument()
  })

  it('runs the focused action on Enter and closes', () => {
    const runs = {
      'switch-dev': vi.fn(),
      'copy-dev': vi.fn(),
      'rename-dev': vi.fn(),
      'delete-dev': vi.fn()
    }
    const onClose = vi.fn()
    render(
      <CommandPalette
        profiles={profiles}
        actions={makeActions(runs)}
        onClose={onClose}
      />
    )

    const palette = screen.getByRole('dialog', { name: 'Command palette' })
    // Default focus is on the first action (Switch to dev)
    fireEvent.keyDown(palette, { key: 'Enter' })

    expect(runs['switch-dev']).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Arrow Down moves focus to the next action', () => {
    const runs = {
      'switch-dev': vi.fn(),
      'copy-dev': vi.fn(),
      'rename-dev': vi.fn(),
      'delete-dev': vi.fn()
    }
    render(
      <CommandPalette
        profiles={profiles}
        actions={makeActions(runs)}
        onClose={vi.fn()}
      />
    )

    const palette = screen.getByRole('dialog', { name: 'Command palette' })
    fireEvent.keyDown(palette, { key: 'ArrowDown' })
    fireEvent.keyDown(palette, { key: 'Enter' })

    expect(runs['copy-dev']).toHaveBeenCalledOnce()
    expect(runs['switch-dev']).not.toHaveBeenCalled()
  })

  it('Escape closes without running anything', () => {
    const runs = {
      'switch-dev': vi.fn(),
      'copy-dev': vi.fn(),
      'rename-dev': vi.fn(),
      'delete-dev': vi.fn()
    }
    const onClose = vi.fn()
    render(
      <CommandPalette
        profiles={profiles}
        actions={makeActions(runs)}
        onClose={onClose}
      />
    )

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(onClose).toHaveBeenCalledOnce()
    expect(runs['switch-dev']).not.toHaveBeenCalled()
  })

  it('skips disabled actions when clicked', () => {
    const runs = {
      'switch-dev': vi.fn(),
      'copy-dev': vi.fn(),
      'rename-dev': vi.fn(),
      'delete-dev': vi.fn()
    }
    const onClose = vi.fn()
    render(
      <CommandPalette
        profiles={profiles}
        actions={makeActions(runs)}
        onClose={onClose}
      />
    )

    const deleteButton = screen.getByRole('option', { name: /Delete dev/ })
    fireEvent.click(deleteButton)

    expect(runs['delete-dev']).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows empty state when no actions match', () => {
    render(
      <CommandPalette profiles={profiles} actions={makeActions()} onClose={vi.fn()} />
    )

    fireEvent.change(screen.getByLabelText('Command palette search'), {
      target: { value: 'nonexistent-term' }
    })

    expect(screen.getByText(/No actions match/)).toBeInTheDocument()
  })
})
