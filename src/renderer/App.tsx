import { useEffect, useMemo, useRef, useState } from 'react'
import { useProfiles } from './hooks/useProfiles'
import { useSamlProfiles } from './hooks/useSamlProfiles'
import { useProfileExpiries } from './hooks/useProfileExpiries'
import { Header } from './components/Header'
import { ProfileList, type ProfileListHandle } from './components/ProfileList'
import { ProfileDetail } from './components/ProfileDetail'
import { ProfileWizard } from './components/ProfileWizard'
import { ConfirmDialog } from './components/ConfirmDialog'
import { RenameProfileDialog } from './components/RenameProfileDialog'
import { SamlSection } from './components/SamlSection'
import {
  CommandPalette,
  type CommandPaletteAction
} from './components/CommandPalette'
import { getLoginAction } from './lib/login-action'
import type {
  AwsProfile,
  LaunchLoginPayload,
  NewProfileData,
  SamlProfile,
  ShellHint
} from './types'

type Tab = 'aws' | 'saml'

export function effectiveAwsProfileName(saml: SamlProfile): string {
  return saml.awsProfile?.trim() || saml.name
}

export default function App() {
  const {
    profiles,
    loading,
    error,
    switchProfile,
    addProfile,
    updateProfile,
    deleteProfile,
    getRenameImpact,
    renameProfile,
    refresh: refreshProfiles
  } = useProfiles()
  const {
    profiles: samlProfiles,
    loading: samlLoading,
    error: samlError,
    addProfile: addSamlProfile,
    updateProfile: updateSamlProfile,
    deleteProfile: deleteSamlProfile,
    refresh: refreshSamlProfiles
  } = useSamlProfiles()

  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [selectedSamlName, setSelectedSamlName] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('aws')
  const [wizardMode, setWizardMode] = useState<'add' | 'edit' | 'clone' | null>(null)
  const [wizardProfile, setWizardProfile] = useState<AwsProfile | null>(null)
  const [deletingName, setDeletingName] = useState<string | null>(null)
  const [renamingName, setRenamingName] = useState<string | null>(null)
  const [shellHint, setShellHint] = useState<ShellHint | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState<string>('')
  const [paletteOpen, setPaletteOpen] = useState(false)

  const { expiries, refresh: refreshExpiries } = useProfileExpiries()
  const profileListRef = useRef<ProfileListHandle | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api
      .getShellHint()
      .then((hint) => {
        if (!cancelled) setShellHint(hint)
      })
      .catch(() => {
        /* fall back to bash template */
      })
    // Request notification permission once on mount so expiry alerts can fire.
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {
        /* user denied or unsupported */
      })
    }
    return () => {
      cancelled = true
    }
  }, [])

  const samlSourcesByAws = useMemo(() => {
    const map = new Map<string, SamlProfile[]>()
    for (const saml of samlProfiles) {
      const target = effectiveAwsProfileName(saml)
      const list = map.get(target) ?? []
      list.push(saml)
      map.set(target, list)
    }
    return map
  }, [samlProfiles])

  const awsProfileNames = useMemo(() => new Set(profiles.map((p) => p.name)), [profiles])

  const activeProfile = profiles.find((p) => p.isActive) || null
  const selectedProfile = selectedName
    ? profiles.find((p) => p.name === selectedName) || null
    : null

  // ARIA announcement when active profile changes
  useEffect(() => {
    if (activeProfile) {
      setAnnouncement(`Active profile is now ${activeProfile.name}`)
    }
  }, [activeProfile?.name])

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return
    const handle = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(handle)
  }, [toast])

  // Surface login verification results as toasts once the file watcher
  // detects the credentials file has been updated post-login.
  useEffect(() => {
    const unsubscribe = window.api.onLoginVerified(({ profileName, result }) => {
      if (result.ok) {
        setToast(`✓ ${profileName} logged in as ${result.arn || 'unknown ARN'}`)
      }
    })
    return unsubscribe
  }, [])

  const handleAdd = () => {
    setWizardProfile(null)
    setWizardMode('add')
  }

  const handleEdit = (profile: AwsProfile) => {
    setWizardProfile(profile)
    setWizardMode('edit')
  }

  const handleDuplicate = (profile: AwsProfile) => {
    setWizardProfile(profile)
    setWizardMode('clone')
  }

  const closeWizard = () => {
    setWizardMode(null)
    setWizardProfile(null)
  }

  const handleSave = async (data: NewProfileData, isEdit: boolean) => {
    if (isEdit && wizardProfile) {
      await updateProfile(wizardProfile.name, data)
    } else {
      await addProfile(data)
    }
    if (!isEdit) setSelectedName(data.name)
    closeWizard()
  }

  const handleDelete = async () => {
    if (deletingName) {
      await deleteProfile(deletingName)
      if (selectedName === deletingName) setSelectedName(null)
      setDeletingName(null)
    }
  }

  const handleRenamed = (newName: string) => {
    setRenamingName(null)
    setSelectedName(newName)
  }

  const handleLaunchTerminal = async (name: string) => {
    try {
      await window.api.launchTerminal(name)
      setToast(`Launching terminal with AWS_PROFILE=${name}`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to launch terminal')
    }
  }

  const handleSwitch = async (name: string) => {
    const result = await switchProfile(name)
    // On Linux there is no cross-shell persistence mechanism — surface that
    // fact so users don't assume new terminals will pick up the profile.
    if (result && !result.persisted && result.note) {
      setToast(result.note)
    }
  }

  const [refreshing, setRefreshing] = useState(false)
  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      // Run all three reads in parallel — they're independent.
      await Promise.all([refreshProfiles(), refreshSamlProfiles(), refreshExpiries()])
      setToast('Refreshed')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  const handleLogin = async (payload: LaunchLoginPayload) => {
    try {
      await window.api.launchLogin(payload)
      // Track the pending login so the file watcher will run an STS probe
      // once the credentials file updates and we can confirm success.
      window.api.trackPendingLogin(payload.profileName).catch(() => {
        /* non-fatal — verification is best-effort */
      })
      const detail =
        payload.kind === 'sso'
          ? `aws sso login --profile ${payload.profileName}`
          : `saml2aws login -a ${payload.samlSection}`
      setToast(`Launched: ${detail}`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to launch login')
    }
  }

  const navigateToSaml = (samlName: string) => {
    setSelectedSamlName(samlName)
    setActiveTab('saml')
  }

  const navigateToAws = (awsName: string) => {
    setSelectedName(awsName)
    setActiveTab('aws')
  }

  const handleCopyExport = async (name: string) => {
    const template = shellHint?.exportLineTemplate ?? 'export AWS_PROFILE=__PROFILE__'
    const line = template.replace('__PROFILE__', name)
    try {
      await navigator.clipboard.writeText(line)
      setToast(`Copied: ${line}`)
    } catch {
      setToast('Copy failed — clipboard unavailable')
    }
  }

  const paletteActions = useMemo<CommandPaletteAction[]>(() => {
    const actions: CommandPaletteAction[] = []
    actions.push({
      id: 'global-add',
      label: 'Add new profile',
      hint: 'Ctrl/Cmd+N',
      group: 'Global',
      run: handleAdd
    })
    actions.push({
      id: 'global-focus-search',
      label: 'Focus search',
      hint: 'Ctrl/Cmd+F',
      group: 'Global',
      run: () => profileListRef.current?.focusSearch()
    })
    for (const p of profiles) {
      if (!p.isActive) {
        actions.push({
          id: `switch-${p.name}`,
          label: `Switch to ${p.name}`,
          hint: p.region ?? '',
          group: 'Switch profile',
          run: () => handleSwitch(p.name)
        })
      }
      const sources = samlSourcesByAws.get(p.name) ?? []
      const loginAction = getLoginAction(p, sources)
      if (loginAction.enabled && loginAction.payload) {
        actions.push({
          id: `login-${p.name}`,
          label: `Login ${p.name}`,
          hint: loginAction.hint,
          group: 'Login',
          run: () => handleLogin(loginAction.payload!)
        })
      }
      actions.push({
        id: `launch-${p.name}`,
        label: `Launch terminal with ${p.name}`,
        group: 'Terminal',
        run: () => handleLaunchTerminal(p.name)
      })
      actions.push({
        id: `copy-${p.name}`,
        label: `Copy export for ${p.name}`,
        hint: shellHint ? shellHint.flavor : undefined,
        group: 'Terminal',
        run: () => handleCopyExport(p.name)
      })
      actions.push({
        id: `rename-${p.name}`,
        label: `Rename ${p.name}`,
        group: 'Manage profile',
        run: () => setRenamingName(p.name)
      })
      actions.push({
        id: `duplicate-${p.name}`,
        label: `Duplicate ${p.name}`,
        group: 'Manage profile',
        run: () => handleDuplicate(p)
      })
      actions.push({
        id: `edit-${p.name}`,
        label: `Edit ${p.name}`,
        group: 'Manage profile',
        run: () => handleEdit(p)
      })
      actions.push({
        id: `delete-${p.name}`,
        label: `Delete ${p.name}`,
        group: 'Manage profile',
        run: () => setDeletingName(p.name)
      })
    }
    return actions
  }, [profiles, shellHint, samlSourcesByAws])

  // Global hotkeys
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inField =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable

      const ctrl = e.ctrlKey || e.metaKey

      if (ctrl && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setPaletteOpen((open) => !open)
        return
      }

      if (ctrl && (e.key === 'n' || e.key === 'N')) {
        if (activeTab === 'aws' && !wizardMode && !renamingName && !deletingName) {
          e.preventDefault()
          handleAdd()
        }
        return
      }

      if (ctrl && (e.key === 'f' || e.key === 'F')) {
        if (activeTab === 'aws') {
          e.preventDefault()
          profileListRef.current?.focusSearch()
        }
        return
      }

      if (e.key === 'Escape' && !inField) {
        if (paletteOpen) setPaletteOpen(false)
        if (wizardMode) closeWizard()
        if (renamingName) setRenamingName(null)
        if (deletingName) setDeletingName(null)
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [activeTab, wizardMode, renamingName, deletingName, paletteOpen])

  return (
    <div className="app">
      <Header
        activeProfile={activeProfile}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />
      <div className="tab-bar">
        <button
          className={`tab ${activeTab === 'aws' ? 'active' : ''}`}
          onClick={() => setActiveTab('aws')}
        >
          AWS Profiles
        </button>
        <button
          className={`tab ${activeTab === 'saml' ? 'active' : ''}`}
          onClick={() => setActiveTab('saml')}
        >
          SAML Config
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}

      {activeTab === 'aws' ? (
        <div className="main-layout">
          <ProfileList
            ref={profileListRef}
            profiles={profiles}
            loading={loading}
            selectedName={selectedProfile?.name || null}
            samlSourcesByAws={samlSourcesByAws}
            shellHint={shellHint}
            expiries={expiries}
            onSelect={(p) => setSelectedName(p.name)}
            onSwitch={handleSwitch}
            onAdd={handleAdd}
            onRename={(p) => setRenamingName(p.name)}
            onDelete={(name) => setDeletingName(name)}
            onLaunchTerminal={handleLaunchTerminal}
            onLogin={handleLogin}
            onCopyFeedback={setToast}
          />
          <ProfileDetail
            profile={selectedProfile}
            samlSources={
              selectedProfile ? samlSourcesByAws.get(selectedProfile.name) ?? [] : []
            }
            expiry={selectedProfile ? expiries.get(selectedProfile.name) ?? null : null}
            onEdit={handleEdit}
            onDelete={setDeletingName}
            onRename={(p) => setRenamingName(p.name)}
            onDuplicate={handleDuplicate}
            onLogin={handleLogin}
            onNavigateToSaml={navigateToSaml}
          />
        </div>
      ) : (
        <div className="main-layout saml-layout">
          <SamlSection
            profiles={samlProfiles}
            loading={samlLoading}
            error={samlError}
            selectedName={selectedSamlName}
            awsProfileNames={awsProfileNames}
            onSelect={setSelectedSamlName}
            onAdd={addSamlProfile}
            onUpdate={updateSamlProfile}
            onDelete={deleteSamlProfile}
            onNavigateToAws={navigateToAws}
          />
        </div>
      )}

      {wizardMode && (
        <ProfileWizard
          mode={wizardMode}
          profile={wizardProfile}
          existingNames={profiles.map((p) => p.name)}
          onSave={handleSave}
          onCancel={closeWizard}
        />
      )}

      {deletingName && (
        <ConfirmDialog
          title="Delete Profile"
          message={`Are you sure you want to delete "${deletingName}"? This will remove it from both ~/.aws/config and ~/.aws/credentials.`}
          onConfirm={handleDelete}
          onCancel={() => setDeletingName(null)}
        />
      )}

      {renamingName && (
        <RenameProfileDialog
          oldName={renamingName}
          getImpact={getRenameImpact}
          onRename={renameProfile}
          onClose={() => setRenamingName(null)}
          onRenamed={handleRenamed}
        />
      )}

      {paletteOpen && (
        <CommandPalette
          profiles={profiles}
          actions={paletteActions}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  )
}
