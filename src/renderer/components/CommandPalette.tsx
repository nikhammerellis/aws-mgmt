import { useEffect, useMemo, useRef, useState } from 'react'
import type { AwsProfile } from '../types'

export interface CommandPaletteAction {
  id: string
  label: string
  hint?: string
  group: string
  disabled?: boolean
  run: () => void
}

interface CommandPaletteProps {
  profiles: AwsProfile[]
  actions: CommandPaletteAction[]
  onClose: () => void
}

function matchesQuery(action: CommandPaletteAction, q: string): number {
  if (!q) return 1
  const haystack = `${action.label} ${action.group} ${action.hint ?? ''}`.toLowerCase()
  const needle = q.toLowerCase()
  if (haystack.includes(needle)) return 2
  // Fallback: all characters of needle appear in order
  let i = 0
  for (const ch of haystack) {
    if (ch === needle[i]) i++
    if (i === needle.length) return 1
  }
  return 0
}

export function CommandPalette({ actions, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    const scored = actions
      .map((a) => ({ action: a, score: matchesQuery(a, query) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
    return scored.map((s) => s.action)
  }, [actions, query])

  useEffect(() => {
    if (focusedIndex >= filtered.length) setFocusedIndex(0)
  }, [filtered, focusedIndex])

  useEffect(() => {
    // Scroll focused item into view
    const el = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-palette-index="${focusedIndex}"]`
    )
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [focusedIndex])

  const runFocused = () => {
    const action = filtered[focusedIndex]
    if (!action || action.disabled) return
    action.run()
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((i) =>
        filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runFocused()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  // Group adjacent actions by group label for display
  const withHeaders: Array<{ header: string } | { action: CommandPaletteAction; index: number }> = []
  let lastGroup = ''
  filtered.forEach((action, index) => {
    if (action.group !== lastGroup) {
      withHeaders.push({ header: action.group })
      lastGroup = action.group
    }
    withHeaders.push({ action, index })
  })

  return (
    <div className="command-palette-overlay" onMouseDown={onClose}>
      <div
        className="command-palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-label="Command palette"
      >
        <input
          ref={inputRef}
          type="text"
          className="command-palette-input"
          placeholder="Type to search actions…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setFocusedIndex(0)
          }}
          aria-label="Command palette search"
        />
        <div className="command-palette-list" ref={listRef} role="listbox">
          {filtered.length === 0 ? (
            <div className="command-palette-empty">No actions match "{query}"</div>
          ) : (
            withHeaders.map((row, i) => {
              if ('header' in row) {
                return (
                  <div key={`h-${i}`} className="command-palette-header">
                    {row.header}
                  </div>
                )
              }
              const { action, index } = row
              return (
                <button
                  key={action.id}
                  type="button"
                  role="option"
                  aria-selected={index === focusedIndex}
                  data-palette-index={index}
                  className={`command-palette-item ${
                    index === focusedIndex ? 'focused' : ''
                  } ${action.disabled ? 'disabled' : ''}`}
                  disabled={action.disabled}
                  onMouseEnter={() => setFocusedIndex(index)}
                  onClick={() => {
                    if (!action.disabled) {
                      action.run()
                      onClose()
                    }
                  }}
                >
                  <span className="command-palette-label">{action.label}</span>
                  {action.hint && <span className="command-palette-hint">{action.hint}</span>}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
