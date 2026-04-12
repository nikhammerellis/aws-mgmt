import { useState } from 'react'

interface SecretFieldProps {
  label: string
  value: string | undefined
}

export function SecretField({ label, value }: SecretFieldProps) {
  const [revealed, setRevealed] = useState(false)

  if (!value) return null

  const displayValue = revealed ? value : '********'

  return (
    <div className="secret-field">
      <label>{label}</label>
      <div className="secret-field-row">
        <code className="secret-value">{displayValue}</code>
        <button
          className="reveal-btn"
          onClick={() => setRevealed(!revealed)}
          title={revealed ? 'Hide' : 'Reveal'}
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
        <button
          className="copy-btn"
          onClick={() => navigator.clipboard.writeText(value)}
          title="Copy to clipboard"
        >
          Copy
        </button>
      </div>
    </div>
  )
}
