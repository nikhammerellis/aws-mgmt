import { promises as fs } from 'fs'
import { basename, join } from 'path'
import { homedir } from 'os'

const BACKUP_DIR = join(homedir(), '.aws', 'aws-mgmt-backups')
const KEEP_PER_FILE = 20

function timestamp(): string {
  // ISO timestamp with safe filename chars: 2026-04-11T14-30-00-000Z
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function ensureBackupDir(): Promise<void> {
  await fs.mkdir(BACKUP_DIR, { recursive: true })
}

export async function backupFile(sourcePath: string): Promise<string | null> {
  let exists = true
  try {
    await fs.access(sourcePath)
  } catch {
    exists = false
  }
  if (!exists) return null

  await ensureBackupDir()
  const base = basename(sourcePath)
  const target = join(BACKUP_DIR, `${timestamp()}-${base}`)
  await fs.copyFile(sourcePath, target)

  // Best-effort prune; never let cleanup failures break the write path.
  pruneBackups(base).catch(() => {
    /* ignore */
  })

  return target
}

export async function pruneBackups(forBaseName: string, keep: number = KEEP_PER_FILE): Promise<void> {
  let entries: string[]
  try {
    entries = await fs.readdir(BACKUP_DIR)
  } catch {
    return
  }

  // Files for this base name share the suffix `-<base>`.
  const matching = entries.filter((e) => e.endsWith(`-${forBaseName}`)).sort()

  // Sorted ascending by timestamp prefix; oldest first. Drop everything beyond `keep`.
  const overflow = matching.length - keep
  if (overflow <= 0) return

  await Promise.all(
    matching.slice(0, overflow).map(async (name) => {
      try {
        await fs.unlink(join(BACKUP_DIR, name))
      } catch {
        /* ignore */
      }
    })
  )
}

export function getBackupDir(): string {
  return BACKUP_DIR
}
