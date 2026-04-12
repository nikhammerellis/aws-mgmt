import { readIniFile, writeIniFile } from '../utils/ini-helpers'
import { getSamlConfigPath } from '../utils/paths'
import { backupFile } from './backup'

export interface SamlEntry {
  name: string
  [key: string]: string
}

export async function readSamlConfig(): Promise<SamlEntry[]> {
  const data = await readIniFile(getSamlConfigPath())
  const entries: SamlEntry[] = []

  for (const [section, values] of Object.entries(data)) {
    entries.push({ name: section, ...values })
  }

  return entries
}

export async function writeSamlProfile(entry: SamlEntry): Promise<void> {
  await backupFile(getSamlConfigPath())
  const data = await readIniFile(getSamlConfigPath())
  const { name, ...values } = entry
  data[name] = values
  await writeIniFile(getSamlConfigPath(), data)
}

export async function deleteSamlProfile(name: string): Promise<void> {
  await backupFile(getSamlConfigPath())
  const data = await readIniFile(getSamlConfigPath())
  delete data[name]
  await writeIniFile(getSamlConfigPath(), data)
}
