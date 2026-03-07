# How to Test Forge Terminal from Your Work Machine via GitHub Codespaces

> This guide explains exactly how to open Forge Terminal in the cloud, then use it from any browser on your work computer — even if your work machine doesn't have Go, Node, or anything installed.

---

## 🧠 What is a Codespace?

Think of a **GitHub Codespace** as a tiny computer that lives inside GitHub's cloud. It runs automatically when you ask for it, builds your code, starts your app, and lets you reach it through a regular web browser. You don't install anything on your work machine. You just open a link.

---

## 📋 What You Need Before You Start

- A **GitHub account** (you already have one — you own this repo)
- A **web browser** on your work machine (Chrome, Edge, Firefox — any of them)
- That's it. Nothing else.

---

## 🚀 STEP-BY-STEP

---

### STEP 1 — Go to the Forge Terminal repository on GitHub

1. Open your web browser on your **work machine**
2. Type this address in the address bar and press **Enter**:
   ```
   https://github.com/mikejsmith1985/forge-terminal
   ```
3. You should see the Forge Terminal code repository page

---

### STEP 2 — Open the "Create a Codespace" menu

1. Look for the big green button near the top right of the page that says **`<> Code`**
2. Click it — a small box will pop open
3. Inside that box, click the tab that says **`Codespaces`** (it's one of two tabs at the top of the box)
4. You will see either:
   - A list of any Codespaces you've made before, OR
   - A message saying you don't have any yet
5. Click the button that says **`Create codespace on main`**

> ⏳ **This will take about 2–5 minutes the first time.** GitHub is building your app from scratch in the cloud. A loading screen will appear — this is normal.

---

### STEP 3 — Watch the Codespace build

1. A new browser tab will open showing what looks like VS Code running in your browser
2. At the bottom of the screen there is a **Terminal panel** (a black area with text)
3. You will see it running commands automatically, like:
   ```
   npm ci --prefix frontend
   go build -o fterm ./cmd/forge
   ```
4. **Wait** until you see this message appear:
   ```
   ✅ Forge Terminal built successfully
   ```
5. After that, a second command runs automatically:
   ```
   NO_BROWSER=1 ./fterm
   ```
6. **Wait** until you see a line in the terminal that looks like this:
   ```
   🌐 External Codespace URL: https://your-codespace-name-3005.app.github.dev?token=XXXXXXXXXXXXX
   ```
   > ⚠️ **IMPORTANT: Copy that entire URL including the `?token=...` part.** You will need it in the next step.

---

### STEP 4 — Make the port publicly reachable (one-time step)

GitHub keeps ports **private** by default. You need to tell it to let your browser in.

1. Look at the bottom of the VS Code browser window — find the tab row that shows `TERMINAL`, `PROBLEMS`, `OUTPUT`, `PORTS`
2. Click **`PORTS`**
3. You will see a row with **Port 3005** and a label called "Forge Terminal"
4. Look at the column called **Visibility** — it probably says `Private`
5. **Right-click** on that row
6. A menu appears — hover over **`Port Visibility`**
7. Click **`Private`** (leave it as Private is fine — it just means only you, when logged into GitHub, can access it)

> ✅ Private visibility is correct and safe. It means only your GitHub account can open the URL.

---

### STEP 5 — Open Forge Terminal in your work browser

1. Go back to the terminal tab in the Codespace (click `TERMINAL` at the bottom)
2. Find the URL you copied in Step 3. It looks like:
   ```
   https://your-codespace-name-3005.app.github.dev?token=XXXXXXXXXXXXX
   ```
3. Open a **new browser tab** on your work machine
4. Paste that full URL (including `?token=...`) into the address bar and press **Enter**
5. If GitHub asks you to **sign in**, sign in with your GitHub account
6. After signing in, you might be redirected — that's normal. **Add `?token=XXXXXXXXXXXXX` back to the end of the URL** if it disappears, then press Enter again

> ✅ You should now see the Forge Terminal interface — a black terminal screen in your browser!

---

### STEP 6 — Confirm it is actually working

Do these 3 quick checks:

**Check 1 — Type a command**
1. Click anywhere inside the black terminal area
2. Type `echo hello` and press **Enter**
3. You should see `hello` printed back — this means the terminal is alive and connected

**Check 2 — Check what machine it's running on**
1. Type `hostname` and press **Enter**
2. You will see a weird name like `codespaces-xxxxxxx` — this confirms it is running in the GitHub cloud, NOT on your work machine

**Check 3 — Check the file system**
1. Type `ls` and press **Enter**
2. You should see files from the forge-terminal project — things like `frontend/`, `cmd/`, `go.mod`

---

### STEP 7 — What the token does (and why it's there)

Because Forge Terminal is running on the internet (not just your laptop), it needs a password so random people can't access your terminal. That `?token=XXXXXXXXXXXXX` in the URL IS the password.

Here's how it works:
- The **first time** you open the URL with `?token=` in it, your browser saves a secure cookie
- **After that**, you don't need to keep the `?token=` in the URL — the cookie remembers you
- If you open a **private/incognito window**, you'll need the token again

> 🔒 Keep that token URL to yourself. Don't share it. It gives full terminal access.

---

## 🛑 How to Stop the Codespace When You're Done

Codespaces cost money if left running. Always stop it when you're done.

1. Go back to: `https://github.com/mikejsmith1985/forge-terminal`
2. Click the green **`<> Code`** button
3. Click the **`Codespaces`** tab
4. Find your running Codespace in the list
5. Click the **`...`** (three dots) menu next to it
6. Click **`Stop codespace`**

> ✅ Stopped codespaces do NOT cost money. Only running ones do. GitHub gives you 60 free hours/month.

---

## 🔁 How to Reconnect the NEXT Time

You don't need to create a new Codespace every time. You already have one:

1. Go to: `https://github.com/mikejsmith1985/forge-terminal`
2. Click **`<> Code`** → **`Codespaces`** tab
3. Click on your existing Codespace name to **resume** it (not "create new")
4. Wait for it to restart (usually 30–60 seconds, much faster than the first time)
5. Check the terminal at the bottom for the new URL with token

> ⚠️ **Every time the Codespace restarts, a NEW token is generated** (unless you set `FORGE_TOKEN` as a secret — see the Advanced section below). Copy the new URL each time.

---

## ⚙️ Advanced: Set a Permanent Token (Optional)

Tired of copying a new token every restart? You can set a permanent one:

1. Go to: `https://github.com/settings/codespaces`
2. Under **Secrets**, click **`New secret`**
3. Name it exactly: `FORGE_TOKEN`
4. Value: type any password you want (make it long, like `my-super-secret-forge-password-2026`)
5. Under **Repository access**, pick `forge-terminal`
6. Click **`Add secret`**

Now every time your Codespace starts, Forge Terminal will use that fixed token — so your URL never changes.

---

## 🆘 Troubleshooting

| Problem | What to do |
|---|---|
| Page says "Unauthorized" | Make sure the full `?token=XXXXX` is at the end of your URL |
| Page loads but terminal is blank/frozen | Wait 10 seconds, then refresh the page |
| Can't find the token URL | In the Codespace terminal, run: `ps aux \| grep fterm` to confirm it's running, then restart it with `NO_BROWSER=1 ./fterm` |
| Codespace stuck building for >10 minutes | Close the tab, go back to the repo, click `...` on the Codespace and click `Rebuild` |
| Port 3005 shows "not available" | In the Ports tab, right-click port 3005 and click `Resume Port` |

---

*Last updated: March 2026 — covers Forge Terminal v3.17.19+*
