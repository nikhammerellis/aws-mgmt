import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // AWS Profiles
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  getActiveProfile: () => ipcRenderer.invoke('get-active-profile'),
  switchProfile: (name: string) => ipcRenderer.invoke('switch-profile', name),
  addProfile: (data: Record<string, unknown>) => ipcRenderer.invoke('add-profile', data),
  updateProfile: (name: string, data: Record<string, unknown>) => ipcRenderer.invoke('update-profile', name, data),
  deleteProfile: (name: string) => ipcRenderer.invoke('delete-profile', name),
  getRenameImpact: (oldName: string, newName: string) =>
    ipcRenderer.invoke('get-rename-impact', oldName, newName),
  renameProfile: (oldName: string, newName: string, options: Record<string, unknown>) =>
    ipcRenderer.invoke('rename-profile', oldName, newName, options),
  getShellHint: () => ipcRenderer.invoke('get-shell-hint'),
  launchTerminal: (name: string) => ipcRenderer.invoke('launch-terminal', name),
  launchLogin: (payload: Record<string, unknown>) => ipcRenderer.invoke('launch-login', payload),
  testProfile: (name: string) => ipcRenderer.invoke('test-profile', name),
  getProfileExpiries: () => ipcRenderer.invoke('get-profile-expiries'),

  // SAML Profiles
  getSamlProfiles: () => ipcRenderer.invoke('get-saml-profiles'),
  addSamlProfile: (data: Record<string, unknown>) => ipcRenderer.invoke('add-saml-profile', data),
  updateSamlProfile: (name: string, data: Record<string, unknown>) => ipcRenderer.invoke('update-saml-profile', name, data),
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
  }
})
