# 🚀 Deploying PaperExtract Studio to Deno Deploy

This project is fully configured and edge-ready for **Deno Deploy** (https://deno.com/deploy).

---

## 🌐 Method 1: Deploy via GitHub (Recommended & Automated)

Deno Deploy natively connects with GitHub for continuous edge deployments with zero server setup.

### Step 1: Initialize Git Repository
In your project directory, initialize Git and commit your code:
```bash
git init
git add .
git commit -m "Initial commit: PaperExtract Studio with Deno Deploy support"
```

### Step 2: Push to Your GitHub Account
Create a new GitHub repository (e.g. `paper-extract-studio`) and push:
```bash
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/paper-extract-studio.git
git branch -M main
git push -u origin main
```

### Step 3: Connect to Deno Deploy
1. Go to [https://dash.deno.com](https://dash.deno.com) and log in with your GitHub account.
2. Click **"New Project"**.
3. Under **"Deploy from GitHub repository"**, select your repository (`paper-extract-studio`).
4. Set the **Production Branch** to `main`.
5. Under **"Entrypoint"**, enter or select:
   ```
   main.ts
   ```
6. Click **"Link"** / **"Deploy"**!
7. Within 5 seconds, your app will be live globally at:
   ```
   https://<your-project-name>.deno.dev
   ```

---

## ⚡ Method 2: Deploy via CLI (`deployctl`)

If you prefer deploying directly from your terminal:

### Step 1: Install `deployctl`
```bash
deno install -A -g jsr:@deno/deployctl
```

### Step 2: Get Your Access Token
1. Go to [https://dash.deno.com/account#access-tokens](https://dash.deno.com/account#access-tokens).
2. Create an **Access Token** and copy it.

### Step 3: Deploy Directly
```powershell
$env:DENO_DEPLOY_TOKEN = "<YOUR_TOKEN_HERE>"
deployctl deploy --project=paper-extract-studio main.ts
```

---

## 📂 Configuration Files Included

- **`main.ts`**: Edge HTTP server serving all static assets, client-side scripts, styles, and health check endpoint (`/healthz`).
- **`deno.json`**: Deno runtime configuration file with start/dev tasks and standard library imports.
- **`.github/workflows/deploy.yml`**: Automated CI/CD pipeline using the official `@denoland/deployctl` GitHub Action.
- **`.gitignore`**: Excludes temporary files, caches, and test artifacts from production deployments.
