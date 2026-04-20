/**
 * Forge Terminal License Server
 * Cloudflare Worker — ~150 lines
 *
 * Endpoints:
 *   POST /webhook/stripe         Stripe webhook (create / suspend licenses)
 *   POST /license/activate       Register a machine, return HMAC token
 *   POST /license/validate       Check status, update lastSeen
 *   POST /license/deactivate     Remove machine registration
 *   GET  /download               Validate token, return short-lived download URL
 *   GET  /download/get           Serve R2 binary using short-lived download token
 *
 * KV namespaces (set in wrangler.toml):
 *   LICENSES  — key: "license:{key}"        value: LicenseRecord JSON
 *   MACHINES  — key: "machine:{key}:{mid}"  value: MachineRecord JSON
 *               key: "count:{key}"          value: numeric string
 *
 * R2 bucket:
 *   FORGE_RELEASES — key pattern: "v{version}/forge-{platform}[.exe]"
 *
 * Secrets (wrangler secret put):
 *   STRIPE_WEBHOOK_SECRET
 *   HMAC_SECRET          (openssl rand -hex 32)
 *   EMAIL_API_KEY        (Resend or SendGrid)
 *   EMAIL_FROM           (e.g. "team@rootlevellabs.tech")
 */

interface Env {
  LICENSES: KVNamespace
  MACHINES: KVNamespace
  FORGE_RELEASES: R2Bucket
  STRIPE_WEBHOOK_SECRET: string
  HMAC_SECRET: string
  EMAIL_API_KEY: string
  EMAIL_FROM: string
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
  const payload = await req.text()
  const sig = req.headers.get('Stripe-Signature') ?? ''
  if (!await verifyStripe(payload, sig, env.STRIPE_WEBHOOK_SECRET)) return new Response('Bad signature', { status: 400 })

  const event = JSON.parse(payload)
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const licenseKey = crypto.randomUUID()
    const record: LicenseRecord = {
      email: session.customer_details?.email ?? '',
      status: 'active',
      expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
      createdAt: new Date().toISOString(),
      stripeSubscriptionId: session.subscription ?? '',
    }
    await env.LICENSES.put(`license:${licenseKey}`, JSON.stringify(record))
    await sendLicenseEmail(record.email, licenseKey, env)
  } else if (event.type === 'customer.subscription.deleted' || event.type === 'invoice.payment_failed') {
    const subId = event.data.object.id ?? event.data.object.subscription
    // Scan is not ideal at scale — use metadata to store key in Stripe for O(1) lookup
    const list = await env.LICENSES.list({ prefix: 'license:' })
    for (const key of list.keys) {
      const raw = await env.LICENSES.get(key.name)
      if (!raw) continue
      const rec: LicenseRecord = JSON.parse(raw)
      if (rec.stripeSubscriptionId === subId) {
        rec.status = 'suspended'
        await env.LICENSES.put(key.name, JSON.stringify(rec))
        break
      }
    }
  }
  return new Response('ok')
}

async function sendLicenseEmail(email: string, key: string, env: Env): Promise<void> {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
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

    return new Response('Not Found', { status: 404 })
  },
}
