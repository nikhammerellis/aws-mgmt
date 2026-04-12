import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RenameProfileDialog } from '../RenameProfileDialog'
import type { RenameImpact } from '../../types'

function makeImpact(overrides: Partial<RenameImpact> = {}): RenameImpact {
  return {
    oldName: 'foo',
    newName: '',
    isDefault: false,
    configExists: true,
    credentialsExists: true,
    isActive: false,
    sourceProfileDependents: [],
    samlDependents: [],
    cliCacheFiles: [],
    conflict: false,
    validationError: 'empty',
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RenameProfileDialog', () => {
  it('renders the impact summary once a valid name is entered', async () => {
    const getImpact = vi.fn(async (_old: string, name: string) => {
      if (!name.trim()) return makeImpact()
      return makeImpact({
        newName: name,
        validationError: null,
        sourceProfileDependents: ['child-a', 'child-b'],
        samlDependents: ['work'],
        isActive: true
      })
    })

    render(
      <RenameProfileDialog
        oldName="foo"
        getImpact={getImpact}
        onRename={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
        onRenamed={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('New name'), { target: { value: 'bar' } })

    await waitFor(() => {
      expect(screen.getByText(/What will change/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/child-a, child-b/)).toBeInTheDocument()
    expect(screen.getByText(/SAML reference/i)).toBeInTheDocument()
    expect(screen.getByText(/Update OS-level/i)).toBeInTheDocument()
  })

  it('disables the confirm button when there is a validation error', async () => {
    const getImpact = vi.fn().mockResolvedValue(
      makeImpact({ newName: 'foo', validationError: 'same' })
    )

    render(
      <RenameProfileDialog
        oldName="foo"
        getImpact={getImpact}
        onRename={vi.fn()}
        onClose={vi.fn()}
        onRenamed={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('New name'), { target: { value: 'foo' } })

    await waitFor(() => {
      expect(screen.getByText(/must differ/i)).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled()
  })

  it('requires the opt-in checkbox to rename the default profile', async () => {
    const getImpact = vi.fn().mockResolvedValue(
      makeImpact({
        oldName: 'default',
        newName: 'primary',
        isDefault: true,
        validationError: null
      })
    )

    render(
      <RenameProfileDialog
        oldName="default"
        getImpact={getImpact}
        onRename={vi.fn()}
        onClose={vi.fn()}
        onRenamed={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('New name'), { target: { value: 'primary' } })

    await waitFor(() => {
      expect(screen.getByText(/Renaming the/i)).toBeInTheDocument()
    })

    const confirmButton = screen.getByRole('button', { name: 'Rename' })
    expect(confirmButton).toBeDisabled()

    fireEvent.click(screen.getByLabelText(/I understand/))
    expect(confirmButton).toBeEnabled()
  })

  it('passes correct rename options based on checkbox state', async () => {
    const onRename = vi.fn().mockResolvedValue(undefined)
    const onRenamed = vi.fn()
    const getImpact = vi.fn().mockResolvedValue(
      makeImpact({
        newName: 'bar',
        validationError: null,
        sourceProfileDependents: ['child'],
        samlDependents: ['work'],
        cliCacheFiles: ['/cache/a.json']
      })
    )

    render(
      <RenameProfileDialog
        oldName="foo"
        getImpact={getImpact}
        onRename={onRename}
        onClose={vi.fn()}
        onRenamed={onRenamed}
      />
    )

    fireEvent.change(screen.getByLabelText('New name'), { target: { value: 'bar' } })
    await waitFor(() => {
      expect(screen.getByText(/What will change/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText(/SAML reference/))
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))

    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith('foo', 'bar', {
        rewriteSourceProfileDependents: true,
        rewriteSamlDependents: false,
        clearCliCache: true,
        allowDefault: undefined
      })
    })

    await waitFor(() => {
      expect(onRenamed).toHaveBeenCalledWith('bar')
    })
  })

  it('surfaces an error message when onRename throws', async () => {
    const onRename = vi.fn().mockRejectedValue(new Error('Rename blocked: conflict'))
    const getImpact = vi.fn().mockResolvedValue(
      makeImpact({ newName: 'bar', validationError: null })
    )

    render(
      <RenameProfileDialog
        oldName="foo"
        getImpact={getImpact}
        onRename={onRename}
        onClose={vi.fn()}
        onRenamed={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('New name'), { target: { value: 'bar' } })
    await waitFor(() => {
      expect(screen.getByText(/What will change/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))

    await waitFor(() => {
      expect(screen.getByText(/Rename blocked: conflict/i)).toBeInTheDocument()
    })
  })

  it('shows a friendly message for the conflict validation error', async () => {
    const getImpact = vi.fn().mockResolvedValue(
      makeImpact({ newName: 'bar', conflict: true, validationError: 'conflict' })
    )

    render(
      <RenameProfileDialog
        oldName="foo"
        getImpact={getImpact}
        onRename={vi.fn()}
        onClose={vi.fn()}
        onRenamed={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('New name'), { target: { value: 'bar' } })

    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument()
    })
  })
})
