import { useState } from 'react'
import { Terminal } from 'lucide-react'
import './LicenseGate.css'

// Purchase URL — sends user to the product page on rootlevellabs.tech
const CHECKOUT_URL = 'https://rootlevellabs.tech/#products'

/**
 * LicenseGate — full-screen overlay shown when no valid license is found.
 *
 * Renders when /api/license/status returns "required" or "expired".
 * On successful activation the page is reloaded so the backend re-checks the
 * freshly written cache and registers all API handlers.
 *
 * @param {{ status: string }} props
 */
export default function LicenseGate({ status }) {
  const [key, setKey]           = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const isExpired = status === 'expired'

  async function handleActivate(e) {
    e.preventDefault()
    const trimmed = key.trim()
    if (!trimmed) {
      setError('Please enter your license key.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const resp = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: trimmed }),
      })

      if (resp.ok) {
        // Cache written — reload so the Go server re-checks and ungates routes.
        window.location.reload()
        return
      }

      const text = await resp.text()
      switch (resp.status) {
        case 400:
          setError(text || 'Invalid license key.')
          break
        case 402:
          setError('Machine limit reached. Deactivate another machine first.')
          break
        case 403:
          setError('This license has been cancelled or expired.')
          break
        default:
          setError(text || 'Activation failed. Please try again.')
      }
    } catch {
      setError('Could not reach the license server. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="license-gate">
      <div className="license-gate__card">
        <div className="license-gate__logo">
          <Terminal size={20} />
          <span className="license-gate__logo-text">Forge Terminal</span>
        </div>

        <h1 className="license-gate__heading">
          {isExpired ? 'Subscription ended' : 'Activate your license'}
        </h1>
        <p className={`license-gate__sub${isExpired ? ' license-gate__sub--expired' : ''}`}>
          {isExpired
            ? 'Your subscription has been cancelled. Renew to continue using Forge Terminal.'
            : 'Enter the license key from your purchase confirmation email.'}
        </p>

        <form onSubmit={handleActivate}>
          <label className="license-gate__label" htmlFor="license-key">
            License key
          </label>
          <input
            id="license-key"
            className="license-gate__input"
            type="text"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          {error && <div className="license-gate__error">{error}</div>}

          <div className="license-gate__actions">
            <button
              type="submit"
              className="license-gate__btn-activate"
              disabled={loading}
            >
              {loading ? 'Activating…' : 'Activate'}
            </button>
          </div>
        </form>

        <hr className="license-gate__divider" />
        <a
          href={CHECKOUT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="license-gate__buy-link"
        >
          {isExpired ? 'Renew subscription →' : 'Buy a license →'}
        </a>
      </div>
    </div>
  )
}
