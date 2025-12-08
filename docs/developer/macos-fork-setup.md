# Fork Forge Terminal with Code Signing

If you want notarized macOS binaries without the security warnings, you can fork the repository and set up automatic code signing and notarization for your own releases.

## Why Fork?

The official releases use ad-hoc signing (development only). If you want production-ready notarized binaries:
- Users won't see security warnings
- Binary is trusted by macOS Gatekeeper
- Professional distribution

## Prerequisites

- **Apple Developer ID Certificate** - $99/year account
- **GitHub account** with repository fork access

## Step 1: Fork the Repository

1. Go to [github.com/mikejsmith1985/forge-terminal](https://github.com/mikejsmith1985/forge-terminal)
2. Click **Fork** button
3. Clone your fork locally

```bash
git clone https://github.com/YOUR_USERNAME/forge-terminal.git
cd forge-terminal
```

## Step 2: Set Up Apple Developer ID

### 2a. Get Developer ID Certificate

1. Go to [developer.apple.com](https://developer.apple.com)
2. Sign in or create account ($99/year)
3. Navigate to **Certificates, Identifiers & Profiles > Certificates**
4. Click **+** and create **Developer ID Application** certificate
5. Download the certificate and double-click to install in Keychain

### 2b. Export as .p12 File

1. Open **Keychain Access**
2. Find your Developer ID certificate
3. Right-click → **Export...**
4. Save as `.p12` file
5. Set a strong password

### 2c. Get App-Specific Password

1. Go to [appleid.apple.com](https://appleid.apple.com) > Security
2. Scroll to **App passwords**
3. Click **Generate**
4. Select **Xcode/Other Tools**
5. Copy the password

## Step 3: Update Workflow in Your Fork

The release workflow includes optional code signing. You need to:

1. Edit `.github/workflows/release.yml` in your fork
2. Replace the "Ad-hoc Sign macOS Binaries" step with production signing code

See the commented section in the workflow file, or copy the full signing implementation from the session notes.

## Step 4: Configure GitHub Secrets

In your fork's repository settings:

1. Go to **Settings > Secrets and variables > Actions**
2. Click **New repository secret** for each:

| Secret Name | Value |
|---|---|
| `MACOS_CERTIFICATE` | Base64-encoded `.p12` file |
| `MACOS_CERTIFICATE_PWD` | Password from Step 2b |
| `MACOS_KEYCHAIN_PWD` | Any strong password (for CI) |
| `NOTARIZATION_USERNAME` | Your Apple ID email |
| `NOTARIZATION_PASSWORD` | App password from Step 2c |
| `NOTARIZATION_TEAM_ID` | 10-character Team ID |

### Encoding the Certificate

```bash
# On your Mac:
base64 -i /path/to/certificate.p12 | pbcopy
```

Paste the result into the `MACOS_CERTIFICATE` secret.

### Finding Your Team ID

1. Go to [developer.apple.com/account](https://developer.apple.com/account)
2. Look for **Team ID** (10-character code)

## Step 5: Test Your Fork

Create a test release:

```bash
git tag v0.0.1-test
git push origin v0.0.1-test
```

Then:
1. Go to your fork's **Actions** tab
2. Watch the **Release** workflow
3. The "Sign and Notarize" step should run and complete in 5-15 minutes
4. Check the workflow logs for any errors

## Step 6: Use Your Fork

Now when you create releases in your fork, the binaries will be:
- ✅ Automatically code-signed
- ✅ Automatically notarized by Apple
- ✅ Trusted by macOS Gatekeeper
- ✅ No security warnings for users

## Syncing with Upstream

To stay up-to-date with the official repository:

```bash
# Add upstream remote
git remote add upstream https://github.com/mikejsmith1985/forge-terminal.git

# Fetch updates
git fetch upstream

# Rebase your fork
git rebase upstream/main
git push origin main --force-with-lease
```

Your workflow configuration will be preserved.

## Troubleshooting

### "Notarization rejected"

Check the workflow logs for details. Common issues:
- Unsigned dependencies in the binary
- Invalid certificate format
- Expired or revoked certificate

Run this on your local binary to debug:
```bash
codesign -dv --verbose bin/forge-darwin-arm64
```

### "Certificate not found"

- Verify `.p12` is correctly base64-encoded
- Check that keychain password matches what you set
- Ensure certificate is valid in Apple Developer account

### "Invalid credentials"

- Double-check app-specific password (NOT your Apple ID password)
- Verify Team ID matches your account
- Verify username is your Apple ID email

## Next Steps

1. After setting up, test with a tag: `git tag v1.0.0 && git push origin v1.0.0`
2. Your releases will have notarized binaries
3. Distribute releases from your fork or download and redistribute binaries

## Support

- Apple Code Signing: https://developer.apple.com/support/code-signing/
- Apple Notarization: https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution
- GitHub Secrets: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
