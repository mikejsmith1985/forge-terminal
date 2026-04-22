/**
 * Forge Terminal License Server
 * Cloudflare Worker
 *
 * Endpoints:
 *   POST /webhook/stripe         Stripe webhook (create / suspend / renew licenses)
 *   POST /license/activate       Register a machine, return HMAC token
 *   POST /license/validate       Check status, update lastSeen
 *   POST /license/deactivate     Remove machine registration
 *   GET  /download               Validate token, return short-lived download URL
 *   GET  /download/get           Serve R2 binary using short-lived download token
 *
 * KV namespaces (set in wrangler.toml):
 *   LICENSES  — key: "license:{key}"        value: LicenseRecord JSON
 *               key: "sub:{subscriptionId}" value: license key string (reverse lookup)
 *   MACHINES  — key: "machine:{key}:{mid}"  value: MachineRecord JSON
 *               key: "count:{key}"          value: numeric string
 *
 * R2 bucket:
 *   FORGE_RELEASES — key pattern: "v{version}/forge-{platform}[.exe]"
 *
 * Secrets (wrangler secret put):
 *   STRIPE_WEBHOOK_SECRET
 *   HMAC_SECRET          (openssl rand -hex 32)
 *   EMAIL_API_KEY        (Resend API key)
 *   EMAIL_FROM           (e.g. "Forge Terminal <team@rootlevellabs.tech>")
 *
 * Stripe events handled:
 *   checkout.session.completed    — create license, send email
 *   invoice.payment_succeeded     — extend expiry (monthly renewal)
 *   customer.subscription.deleted — suspend license
 *   invoice.payment_failed        — suspend license
 */

interface Env {
  LICENSES: KVNamespace
  MACHINES: KVNamespace
  FORGE_RELEASES: R2Bucket
  STRIPE_WEBHOOK_SECRET: string
  HMAC_SECRET: string
  RESEND_API_KEY: string
  EMAIL_FROM: string
  // Optional GitHub Personal Access Token. When set, authenticated requests
  // to api.github.com get a 5000/hr rate limit per IP instead of the 60/hr
  // unauthenticated limit shared across all Cloudflare egress IPs.
  GITHUB_TOKEN?: string
}

interface LicenseRecord {
  email: string
  status: 'active' | 'suspended' | 'expired'
  expiresAt: string
  createdAt: string
  stripeSubscriptionId: string
}

interface MachineRecord {
  activatedAt: string
  lastSeen: string
  machineName: string
}

// ── Token helpers ─────────────────────────────────────────────────────────────

async function signToken(payload: object, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const body = btoa(JSON.stringify(payload))
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  return `${body}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`
}

async function verifyToken(token: string, secret: string): Promise<Record<string, unknown> | null> {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const expectedSig = Uint8Array.from(atob(sig), c => c.charCodeAt(0))
  const valid = await crypto.subtle.verify('HMAC', key, expectedSig, enc.encode(body))
  if (!valid) return null
  try { return JSON.parse(atob(body)) } catch { return null }
}

// ── Stripe webhook ────────────────────────────────────────────────────────────

async function verifyStripe(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')))
  const t = parts['t'], v1 = parts['v1']
  if (!t || !v1) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('') === v1
}

async function handleStripeWebhook(req: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_WEBHOOK_SECRET) return new Response('Webhook secret not configured', { status: 503 })

  const payload = await req.text()
  const sig = req.headers.get('Stripe-Signature') ?? ''
  if (!await verifyStripe(payload, sig, env.STRIPE_WEBHOOK_SECRET)) return new Response('Bad signature', { status: 400 })

  const event = JSON.parse(payload)

  if (event.type === 'checkout.session.completed') {
    await handleCheckoutCompleted(event.data.object, env)

  } else if (event.type === 'invoice.payment_succeeded') {
    // Extend the license expiry on each successful monthly renewal.
    const subId: string = event.data.object.subscription
    if (subId) await extendLicenseExpiry(subId, env)

  } else if (event.type === 'customer.subscription.deleted' || event.type === 'invoice.payment_failed') {
    const subId: string = event.data.object.id ?? event.data.object.subscription
    if (subId) await suspendLicenseBySubscription(subId, env)
  }

  return new Response('ok')
}

// ── Monthly billing: 30 days + 5 grace days ───────────────────────────────────
const MONTHLY_EXPIRY_MS = 35 * 86400000

async function handleCheckoutCompleted(session: Record<string, unknown>, env: Env): Promise<void> {
  const licenseKey = crypto.randomUUID()
  const subscriptionId = (session.subscription as string) ?? ''
  const record: LicenseRecord = {
    email: (session.customer_details as Record<string, string>)?.email ?? '',
    status: 'active',
    expiresAt: new Date(Date.now() + MONTHLY_EXPIRY_MS).toISOString(),
    createdAt: new Date().toISOString(),
    stripeSubscriptionId: subscriptionId,
  }

  // Primary record
  await env.LICENSES.put(`license:${licenseKey}`, JSON.stringify(record))

  // Reverse-lookup so we can find the key in O(1) on subscription events
  if (subscriptionId) {
    await env.LICENSES.put(`sub:${subscriptionId}`, licenseKey)
  }

  await sendLicenseEmail(record.email, licenseKey, env)
}

// extendLicenseExpiry adds MONTHLY_EXPIRY_MS to the current time, keeping the
// license active after Stripe successfully charges the next billing cycle.
async function extendLicenseExpiry(subscriptionId: string, env: Env): Promise<void> {
  const licenseKey = await env.LICENSES.get(`sub:${subscriptionId}`)
  if (!licenseKey) return

  const raw = await env.LICENSES.get(`license:${licenseKey}`)
  if (!raw) return

  const rec: LicenseRecord = JSON.parse(raw)
  rec.expiresAt = new Date(Date.now() + MONTHLY_EXPIRY_MS).toISOString()
  rec.status = 'active' // Reactivate if it was suspended due to payment failure
  await env.LICENSES.put(`license:${licenseKey}`, JSON.stringify(rec))
}

// suspendLicenseBySubscription uses the O(1) reverse-lookup to find and suspend
// a license when a subscription is cancelled or a payment fails.
async function suspendLicenseBySubscription(subscriptionId: string, env: Env): Promise<void> {
  const licenseKey = await env.LICENSES.get(`sub:${subscriptionId}`)
  if (!licenseKey) return

  const raw = await env.LICENSES.get(`license:${licenseKey}`)
  if (!raw) return

  const rec: LicenseRecord = JSON.parse(raw)
  rec.status = 'suspended'
  await env.LICENSES.put(`license:${licenseKey}`, JSON.stringify(rec))
}

async function sendLicenseEmail(email: string, key: string, env: Env): Promise<void> {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: email,
      subject: 'Your Forge Terminal License Key',
      html: `<p>Thank you for your purchase!</p><p><strong>License key:</strong> <code>${key}</code></p><p>Paste this key into Forge Terminal when prompted.</p>`,
    }),
  })
}

// ── License endpoints ─────────────────────────────────────────────────────────

async function handleActivate(req: Request, env: Env): Promise<Response> {
  if (!env.HMAC_SECRET) return new Response('License service not yet configured', { status: 503 })

  const { key, machineId, machineName } = await req.json() as { key: string, machineId: string, machineName: string }
  const raw = await env.LICENSES.get(`license:${key}`)
  if (!raw) return new Response('License not found', { status: 404 })
  const lic: LicenseRecord = JSON.parse(raw)
  if (lic.status !== 'active') return new Response('License suspended or expired', { status: 403 })

  const countRaw = await env.MACHINES.get(`count:${key}`)
  if (parseInt(countRaw ?? '0') >= 2) return new Response('Machine limit reached', { status: 402 })

  const now = new Date().toISOString()
  await env.MACHINES.put(`machine:${key}:${machineId}`, JSON.stringify({ activatedAt: now, lastSeen: now, machineName }))
  await env.MACHINES.put(`count:${key}`, String(parseInt(countRaw ?? '0') + 1))

  const token = await signToken({ key, machineId, iat: Date.now() }, env.HMAC_SECRET)
  return Response.json({ token, email: lic.email, expiresAt: lic.expiresAt })
}

async function handleValidate(req: Request, env: Env): Promise<Response> {
  if (!env.HMAC_SECRET) return new Response('License service not yet configured', { status: 503 })

  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const payload = await verifyToken(token ?? '', env.HMAC_SECRET)
  if (!payload) return Response.json({ status: 'expired', expiresAt: '' })

  const { key } = await req.json() as { key: string, machineId: string }
  const raw = await env.LICENSES.get(`license:${key}`)
  if (!raw) return Response.json({ status: 'not_found', expiresAt: '' })
  const lic: LicenseRecord = JSON.parse(raw)

  const status = lic.status === 'active' ? 'ok' : 'expired'
  if (payload.machineId) {
    await env.MACHINES.put(`machine:${key}:${payload.machineId}`, JSON.stringify({ lastSeen: new Date().toISOString() }), { metadata: {} })
  }
  return Response.json({ status, expiresAt: lic.expiresAt })
}

async function handleDeactivate(req: Request, env: Env): Promise<Response> {
  if (!env.HMAC_SECRET) return new Response('License service not yet configured', { status: 503 })

  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const payload = await verifyToken(token ?? '', env.HMAC_SECRET)
  if (!payload) return new Response('Invalid token', { status: 401 })

  const { key, machineId } = await req.json() as { key: string, machineId: string }
  await env.MACHINES.delete(`machine:${key}:${machineId}`)
  const countRaw = await env.MACHINES.get(`count:${key}`)
  const newCount = Math.max(0, parseInt(countRaw ?? '1') - 1)
  await env.MACHINES.put(`count:${key}`, String(newCount))
  return new Response(null, { status: 204 })
}

// ── Download endpoints ────────────────────────────────────────────────────────

async function handleDownload(req: Request, env: Env): Promise<Response> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const payload = await verifyToken(token ?? '', env.HMAC_SECRET)
  if (!payload) return new Response('Unauthorized', { status: 401 })

  const url = new URL(req.url)
  const version = url.searchParams.get('version')
  const platform = url.searchParams.get('platform')
  if (!version || !platform) return new Response('Missing version or platform', { status: 400 })

  // Short-lived (15 min) download token
  const dt = await signToken({ v: version, p: platform, exp: Date.now() + 900_000, op: 'dl' }, env.HMAC_SECRET)
  const downloadUrl = `${url.origin}/download/get?dt=${encodeURIComponent(dt)}&version=${version}&platform=${platform}`
  return Response.json({ url: downloadUrl })
}

async function handleDownloadGet(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const dt = url.searchParams.get('dt')
  const version = url.searchParams.get('version')
  const platform = url.searchParams.get('platform')

  const payload = await verifyToken(dt ?? '', env.HMAC_SECRET) as { exp?: number, op?: string } | null
  if (!payload || payload.op !== 'dl' || !payload.exp || Date.now() > payload.exp) {
    return new Response('Download token expired or invalid', { status: 401 })
  }

  const ext = platform?.includes('windows') ? '.exe' : ''
  const objectKey = `v${version}/forge-${platform}${ext}`
  const object = await env.FORGE_RELEASES.get(objectKey)
  if (!object) return new Response('Release not found', { status: 404 })

  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="forge-${platform}${ext}"`,
    },
  })
}

// ── Router ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    const method = request.method

    if (method === 'POST' && pathname === '/webhook/stripe') return handleStripeWebhook(request, env)
    if (method === 'POST' && pathname === '/license/activate') return handleActivate(request, env)
    if (method === 'POST' && pathname === '/license/validate') return handleValidate(request, env)
    if (method === 'POST' && pathname === '/license/deactivate') return handleDeactivate(request, env)
    if (method === 'GET'  && pathname === '/download') return handleDownload(request, env)
    if (method === 'GET'  && pathname === '/download/get') return handleDownloadGet(request, env)
    if (method === 'GET'  && pathname === '/version/latest') return handleVersionLatest(request, env)

    return new Response('Not Found', { status: 404 })
  },
}

// ── Version proxy ─────────────────────────────────────────────────────────────
//
// The desktop updater used to hit api.github.com directly, which is limited to
// 60 unauthenticated requests per hour per source IP. When users upgraded or
// the agent published many releases in a day, clients would start getting
// "GitHub API returned status 403" rate-limit errors.
//
// This endpoint proxies GitHub's `/releases/latest` through the Cloudflare
// Worker and caches the response at the edge for 5 minutes. Clients now hit
// the worker (unlimited for our domain) instead of GitHub, which eliminates
// the rate limit entirely.
//
// Cache key is the request URL itself (Cloudflare's default), so the first
// request in a 5-minute window warms the cache and all subsequent requests are
// served instantly from the edge.

const GITHUB_RELEASES_LATEST_URL =
  'https://api.github.com/repos/mikejsmith1985/forge-terminal/releases/latest'
// Fresh cache TTL (browsers + edge cache respect this). 5 minutes keeps the
// update banner feeling responsive without hammering GitHub.
const VERSION_CACHE_TTL_SECONDS = 300
// Stale-if-error TTL — if GitHub rate-limits the worker (their 60 req/hr
// applies per source IP, and Cloudflare egress IPs are shared), we keep
// returning the last known-good response for up to an hour so users are
// never shown the raw rate-limit error.
const VERSION_STALE_TTL_SECONDS = 3600

async function handleVersionLatest(request: Request, env: Env): Promise<Response> {
  const cache = caches.default
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' })

  const cached = await cache.match(cacheKey)
  if (cached) {
    // Fast path — fresh entry in edge cache.
    return cached
  }

  const githubHeaders: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Forge-Terminal-Worker',
  }
  if (env.GITHUB_TOKEN) {
    githubHeaders['Authorization'] = `Bearer ${env.GITHUB_TOKEN}`
  }

  let githubResponse: Response
  try {
    githubResponse = await fetch(GITHUB_RELEASES_LATEST_URL, { headers: githubHeaders })
  } catch (fetchError) {
    return new Response(
      JSON.stringify({ error: 'upstream fetch failed', detail: String(fetchError) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Happy path — got a 200 from GitHub. Cache it and return.
  if (githubResponse.ok) {
    const responseBody = await githubResponse.text()
    // `s-maxage` controls the CDN cache (VERSION_CACHE_TTL_SECONDS), while
    // `stale-while-revalidate` lets the edge serve the cached value for an
    // extra hour while it fetches a fresh copy in the background.
    const edgeResponse = new Response(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, s-maxage=${VERSION_CACHE_TTL_SECONDS}, stale-while-revalidate=${VERSION_STALE_TTL_SECONDS}`,
        'Access-Control-Allow-Origin': '*',
      },
    })
    await cache.put(cacheKey, edgeResponse.clone())
    return edgeResponse
  }

  // Non-OK (most commonly 403 rate limit). Pass through the status and body
  // but do NOT cache — we want the next request to retry GitHub after TTL.
  // If clients were previously seeing a cached 200 this never fires because
  // `cache.match` short-circuits above.
  return new Response(await githubResponse.text(), {
    status: githubResponse.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
