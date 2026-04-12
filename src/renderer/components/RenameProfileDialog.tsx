import { useEffect, useState } from 'react'
import type { RenameImpact, RenameOptions } from '../types'

interface RenameProfileDialogProps {
  oldName: string
  getImpact: (oldName: string, newName: string) => Promise<RenameImpact>
  onRename: (oldName: string, newName: string, options: RenameOptions) => Promise<void>
  onClose: () => void
  onRenamed: (newName: string) => void
}

const VALIDATION_MESSAGES: Record<string, string> = {
  empty: 'Enter a new name.',
  same: 'New name must differ from the current name.',
  conflict: 'A profile with that name already exists.',
  'invalid-chars': 'Only letters, digits, underscores, and hyphens are allowed.',
  'not-found': 'The original profile no longer exists.',
  'default-disallowed': 'Renaming the default profile is disallowed.'
}

function profileSection(name: string): string {
  return name === 'default' ? 'default' : `profile ${name}`
}

export function RenameProfileDialog({
  oldName,
  getImpact,
  onRename,
  onClose,
  onRenamed
}: RenameProfileDialogProps) {
  const [newName, setNewName] = useState('')
  const [impact, setImpact] = useState<RenameImpact | null>(null)
  const [rewriteDependents, setRewriteDependents] = useState(true)
  const [rewriteSaml, setRewriteSaml] = useState(true)
  const [clearCache, setClearCache] = useState(true)
  const [confirmDefault, setConfirmDefault] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const handle = setTimeout(() => {
      getImpact(oldName, newName)
        .then((result) => {
          if (!cancelled) setImpact(result)
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : 'Failed to compute impact')
          }
        })
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [oldName, newName, getImpact])

  const handleConfirm = async () => {
    if (!impact || impact.validationError) return
    if (impact.isDefault && !confirmDefault) return
    setBusy(true)
    setError(null)
    try {
      await onRename(oldName, impact.newName, {
        rewriteSourceProfileDependents: rewriteDependents,
        rewriteSamlDependents: rewriteSaml,
        clearCliCache: clearCache,
        allowDefault: impact.isDefault ? confirmDefault : undefined
      })
      onRenamed(impact.newName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed')
    } finally {
      setBusy(false)
    }
  }

  const validationMessage = impact?.validationError
    ? VALIDATION_MESSAGES[impact.validationError]
    : null

  const confirmDisabled =
    busy ||
    !impact ||
    impact.validationError !== null ||
    (impact.isDefault && !confirmDefault)

  return (
    <div className="dialog-overlay" onClick={busy ? undefined : onClose}>
      <div
        className="dialog rename-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="rename-dialog-title"
      >
        <h3 id="rename-dialog-title">Rename Profile</h3>
        <p>
          Renaming <strong>{oldName}</strong>. References in other profiles and SAML config can be
          updated automatically.
        </p>

        <div className="form-field">
          <label htmlFor="rename-new-name">New name</label>
          <input
            id="rename-new-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="my-renamed-profile"
            autoFocus
            disabled={busy}
          />
        </div>

        {validationMessage && (
          <div className="rename-validation" role="alert">
            {validationMessage}
          </div>
        )}

        {impact && !impact.validationError && (
          <div className="rename-impact">
            <h4>What will change</h4>
            <ul className="impact-list">
              {impact.configExists && (
                <li>
                  Move <code>[{profileSection(oldName)}]</code> →{' '}
                  <code>[{profileSection(impact.newName)}]</code> in <code>~/.aws/config</code>
                </li>
              )}
              {impact.credentialsExists && (
                <li>
                  Move <code>[{oldName}]</code> → <code>[{impact.newName}]</code> in{' '}
                  <code>~/.aws/credentials</code>
                </li>
              )}
              {impact.isActive && (
                <li>
                  Update OS-level <code>AWS_PROFILE</code> from <code>{oldName}</code> to{' '}
                  <code>{impact.newName}</code> (existing terminals are unaffected)
                </li>
              )}
            </ul>

            {impact.sourceProfileDependents.length > 0 && (
              <label className="impact-option">
                <input
                  type="checkbox"
                  checked={rewriteDependents}
                  onChange={(e) => setRewriteDependents(e.target.checked)}
                  disabled={busy}
                />
                <span>
                  Update <strong>{impact.sourceProfileDependents.length}</strong> dependent
                  profile{impact.sourceProfileDependents.length === 1 ? '' : 's'} (
                  {impact.sourceProfileDependents.join(', ')})
                </span>
              </label>
            )}

            {impact.samlDependents.length > 0 && (
              <label className="impact-option">
                <input
                  type="checkbox"
                  checked={rewriteSaml}
                  onChange={(e) => setRewriteSaml(e.target.checked)}
                  disabled={busy}
                />
                <span>
                  Update <strong>{impact.samlDependents.length}</strong> SAML reference
                  {impact.samlDependents.length === 1 ? '' : 's'} (
                  {impact.samlDependents.join(', ')})
                </span>
              </label>
            )}

            {impact.cliCacheFiles.length > 0 && (
              <label className="impact-option">
                <input
                  type="checkbox"
                  checked={clearCache}
                  onChange={(e) => setClearCache(e.target.checked)}
                  disabled={busy}
                />
                <span>
                  Clear <strong>{impact.cliCacheFiles.length}</strong> assume-role cache file
                  {impact.cliCacheFiles.length === 1 ? '' : 's'} in{' '}
                  <code>~/.aws/cli/cache/</code>
                </span>
              </label>
            )}

            {impact.isDefault && (
              <div className="rename-warning" role="alert">
                <strong>Warning:</strong> Renaming the <code>default</code> profile will break any
                tool that falls back to <code>default</code> until a new default exists.
                <label className="impact-option">
                  <input
                    type="checkbox"
                    checked={confirmDefault}
                    onChange={(e) => setConfirmDefault(e.target.checked)}
                    disabled={busy}
                  />
                  <span>I understand, rename the default profile</span>
                </label>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rename-validation" role="alert">
            {error}
          </div>
        )}

        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={confirmDisabled}
          >
            {busy ? 'Renaming…' : 'Rename'}
          </button>
        </div>
      </div>
    </div>
  )
}
