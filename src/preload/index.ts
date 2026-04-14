import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  ElectronAPI,
  LaunchLoginPayload,
  LoginVerification,
  NewProfileData,
  RenameOptions,
  SamlProfile
} from '../renderer/types'

/**
 * Strongly-typed preload bridge. Every method here must satisfy the
 * `ElectronAPI` contract in ../renderer/types/index.ts — the final `satisfies`
 * check below enforces this at compile time, so adding a method to
 * `ElectronAPI` without wiring it here is a hard build error rather than
 * a silent runtime `undefined`.
 */
const api: ElectronAPI = {
  // App meta
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // AWS Profiles
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  getActiveProfile: () => ipcRenderer.invoke('get-active-profile'),
  switchProfile: (name: string) => ipcRenderer.invoke('switch-profile', name),
  addProfile: (data: NewProfileData) => ipcRenderer.invoke('add-profile', data),
  updateProfile: (name: string, data: NewProfileData) =>
    ipcRenderer.invoke('update-profile', name, data),
  deleteProfile: (name: string) => ipcRenderer.invoke('delete-profile', name),
  getRenameImpact: (oldName: string, newName: string) =>
    ipcRenderer.invoke('get-rename-impact', oldName, newName),
  renameProfile: (oldName: string, newName: string, options: RenameOptions) =>
    ipcRenderer.invoke('rename-profile', oldName, newName, options),
  getShellHint: () => ipcRenderer.invoke('get-shell-hint'),
  launchTerminal: (name: string) => ipcRenderer.invoke('launch-terminal', name),
  launchLogin: (payload: LaunchLoginPayload) => ipcRenderer.invoke('launch-login', payload),
  testProfile: (name: string) => ipcRenderer.invoke('test-profile', name),
  getProfileExpiries: () => ipcRenderer.invoke('get-profile-expiries'),
  trackPendingLogin: (name: string) => ipcRenderer.invoke('track-pending-login', name),

  // SAML Profiles
  getSamlProfiles: () => ipcRenderer.invoke('get-saml-profiles'),
  addSamlProfile: (data: SamlProfile) => ipcRenderer.invoke('add-saml-profile', data),
  updateSamlProfile: (name: string, data: SamlProfile) =>
    ipcRenderer.invoke('update-saml-profile', name, data),
  deleteSamlProfile: (name: string) => ipcRenderer.invoke('delete-saml-profile', name),

  // File change events
  onProfilesChanged: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('profiles-changed', handler)
    return () => ipcRenderer.removeListener('profiles-changed', handler)
  },
  onSamlChanged: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('saml-changed', handler)
    return () => ipcRenderer.removeListener('saml-changed', handler)
  },
  onLoginVerified: (callback: (payload: LoginVerification) => void) => {
    const handler = (_e: IpcRendererEvent, payload: LoginVerification) => callback(payload)
    ipcRenderer.on('login-verified', handler)
    return () => ipcRenderer.removeListener('login-verified', handler)
  },
  onExpiriesChanged: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('expiries-changed', handler)
    return () => ipcRenderer.removeListener('expiries-changed', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
