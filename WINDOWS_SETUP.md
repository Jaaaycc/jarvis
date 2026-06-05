# Windows Docker Setup Guide

Get JARVIS running on Windows with Docker Desktop in 5 minutes.

## Prerequisites

- [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) installed and running
- An Anthropic API key → [console.anthropic.com](https://console.anthropic.com/)
- A GitHub Personal Access Token → [github.com/settings/tokens](https://github.com/settings/tokens?type=beta)

## GitHub Token Scopes Required

When creating your GitHub PAT, enable these permissions:
- **Contents** → Read and write
- **Metadata** → Read-only  
- **Administration** → Read and write (needed to create new repos)

---

## Step 1 — Clone your fork

Open PowerShell or Command Prompt:

```powershell
git clone https://github.com/Jaaaycc/jarvis.git C:\jarvis
cd C:\jarvis
```

## Step 2 — Create your `.env` file

```powershell
copy .env.example .env
notepad .env
```

Fill in your real values:
```env
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
GITHUB_TOKEN=ghp_YOUR_TOKEN_HERE
```

Save and close Notepad.

## Step 3 — Create your `config.yaml`

```powershell
copy config.template.yaml config.yaml
notepad config.yaml
```

Replace `sk-ant-YOUR_ANTHROPIC_KEY_HERE` with your real Anthropic key. Save and close.

## Step 4 — Build and start JARVIS

```powershell
docker compose up -d --build
```

This will:
1. Build the Docker image from your fork (~3-5 minutes first time)
2. Start the JARVIS daemon in the background
3. Mount your config.yaml into the container

## Step 5 — Open the dashboard

Open your browser and go to:

```
http://localhost:3142
```

The dashboard will walk you through first-time setup (LLM verification, profile interview, tour).

**After completing setup, restart the container:**
```powershell
docker compose restart
```

---

## Useful Commands

```powershell
# View live logs
docker compose logs -f

# Stop JARVIS
docker compose down

# Start JARVIS
docker compose up -d

# Restart
docker compose restart

# Rebuild after code changes
docker compose up -d --build

# Check status
docker compose ps
```

---

## Verify GitHub Token Works

Once running, open the JARVIS dashboard at `http://localhost:3142`.

Go to **Settings → Site Builder** and click **"Validate GitHub Token"**.
You should see your GitHub username (`Jaaaycc`) and the granted scopes.

---

## How the Website Generator Works

1. Open the JARVIS dashboard → **Sites** room
2. Click **New Site**
3. Fill out the form: site type, name, colors, sections, tone
4. Hit **Generate** — Claude writes the full HTML/CSS/JS
5. JARVIS automatically creates a new GitHub repo under `Jaaaycc` and pushes the site
6. Enable GitHub Pages on the repo → your site is live

---

## Troubleshooting

### Dashboard won't load
```powershell
docker compose logs jarvis
# Look for startup errors
```

### Config not found
Make sure `config.yaml` exists in `C:\jarvis\` (same folder as `docker-compose.yml`).

### GitHub push fails
- Confirm your token has `Administration` (read/write) and `Contents` (read/write) scopes
- Validate via dashboard → Settings → Site Builder

### Container exits immediately
```powershell
docker compose logs --tail=50 jarvis
```
Most common cause: bad API key format in `.env` or `config.yaml`.
