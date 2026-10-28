# Link-Page Builder + Posts

A fast, fully customisable **Linktree-style link page** with a built-in **posts feed**, **drag & drop admin panel**, **18+ age alert**, **Terms & Privacy pages**, **real analytics** and a **site ON/OFF switch**.

Runs completely **free and for life** on Cloudflare (Pages or Workers + D1). One single JavaScript file, no build step, no frameworks.

> **Developed by Durgesh Pandey**
> Telegram channel: <https://t.me/Luxtechzones>

---

## Table of contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Project files](#project-files)
4. [Setup on Cloudflare Pages (recommended)](#setup-on-cloudflare-pages-recommended)
5. [Setup on Cloudflare Workers (alternative)](#setup-on-cloudflare-workers-alternative)
6. [First run checklist](#first-run-checklist)
7. [Using the admin panel](#using-the-admin-panel)
8. [Important URLs](#important-urls)
9. [Analytics: what is counted and how](#analytics-what-is-counted-and-how)
10. [Updating the site](#updating-the-site)
11. [Security tips](#security-tips)
12. [Free plan limits](#free-plan-limits)
13. [Troubleshooting](#troubleshooting)
14. [Responsible use](#responsible-use)
15. [Credits](#credits)

---

## Features

**Public site**
- Home page is your custom link page (like linktr.ee), server-rendered for speed.
- Posts page `/posts` with thumbnail cards, search, infinite scroll, real view counts and "time ago".
- Tapping a post opens its link directly (no extra page in between).
- 18+ age alert with Yes / No buttons (fully editable text).
- Auto-generated **Terms & Conditions** (`/terms`) and **Privacy Policy** (`/privacy`).
- Closed page when the site is switched OFF.

**Page builder (admin)**
- Unlimited links, **drag & drop reorder** (works on phones too).
- Per-link: visible toggle, duplicate, icon image, **premium shine button**.
- 6 ready themes, plus full control over:
  - Background: solid colour, gradient (angle) or image (position, blur)
  - Image overlay: none, solid colour or gradient, with opacity
  - Text colour and font
  - Buttons: style (gradient, solid, outline, glass), colours, size (S/M/L), **text alignment (left / center / right)**, width (full / narrow), roundness, hover animation
- Live preview while you edit.
- Posts manager: add, edit, delete, **pin to top**.
- SEO settings: page title, description, share image, favicon.
- Backup and restore of your design and links (JSON file).
- **Site ON/OFF switch** in the top bar.

**Analytics**
- Daily visitors, active now, unique visitors, page views.
- Traffic sources (Instagram, Telegram, Google, direct and more), country, device.
- Link clicks and top posts.

---

## Tech stack

| Part | Technology |
|------|-----------|
| Hosting | Cloudflare Pages (`_worker.js`) or Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Frontend | Plain HTML, CSS and JavaScript (no framework) |
| Auth | Password + signed HttpOnly cookie |

Tables are created automatically on first request. There is nothing to migrate manually.

---

## Project files

```
your-repo/
├── _worker.js     <- the whole application (use the v4 code)
└── README.md
```

For **Cloudflare Pages** keep only `_worker.js` (and optionally this README) in the repo. Do **not** add a `wrangler.jsonc` file to a Pages repo.

---

## Setup on Cloudflare Pages (recommended)

You get a free URL like `https://yourname.pages.dev` (your account name does **not** appear in it).

### 1. Put the code on GitHub
1. Create a new GitHub repository, for example `linkpage`.
2. Upload the application code as a file named exactly **`_worker.js`** (underscore at the start).
3. Commit to the `main` branch.

### 2. Create the D1 database
1. Log in to <https://dash.cloudflare.com>.
2. Go to **Storage & Databases -> D1 SQL database -> Create database**.
3. Name it `sitedb` and create it.

### 3. Create the Pages project
1. Go to **Workers & Pages -> Create application**.
2. Click the small link **"Looking to deploy Pages? Get started"** (this is where Pages is hidden in the new UI).
3. Choose **Connect to Git** and select your repository.
4. Set the **Project name** (this becomes `projectname.pages.dev`).
5. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: `/`
6. Click **Save and Deploy**.

### 4. Connect the database
1. Open your Pages project -> **Settings -> Bindings -> Add -> D1 database**.
2. Variable name: **`DB`** (capital letters, exactly).
3. Select `sitedb` and save.

### 5. Add the secrets
Open **Settings -> Variables and Secrets -> Add** and create both as type **Secret**:

| Name | Value |
|------|-------|
| `ADMIN_PASSWORD` | A strong password you will use to log in |
| `SESSION_SECRET` | A long random text (30-40+ characters) |

### 6. Redeploy
Bindings and secrets only apply to a **new deployment**.
Go to **Deployments -> latest deployment -> Retry deployment** (or push any small commit).

Then open `https://yourproject.pages.dev/admin` and log in.

---

## Setup on Cloudflare Workers (alternative)

Use this if you prefer Workers. The URL will look like `name.<account-subdomain>.workers.dev`, which includes your Cloudflare account subdomain.

1. Create the D1 database `sitedb` and copy its **Database ID** (it is the long ID at the end of the database page URL).
2. Create a GitHub repo with these two files in the root:

   `worker.js` (the application code)

   `wrangler.jsonc`
   ```json
   {
     "name": "linkpage",
     "main": "worker.js",
     "compatibility_date": "2026-10-01",
     "d1_databases": [
       {
         "binding": "DB",
         "database_name": "sitedb",
         "database_id": "PASTE-YOUR-DATABASE-ID-HERE"
       }
     ]
   }
   ```
3. In Cloudflare go to **Workers & Pages -> Create -> Import a repository** and select the repo. Keep the deploy command `npx wrangler deploy`.
4. Open the Worker -> **Settings -> Variables and Secrets** and add `ADMIN_PASSWORD` and `SESSION_SECRET` as **Secret**.
5. Open `https://linkpage.<account>.workers.dev/admin`.

---

## First run checklist

1. Open `/admin` and log in.
2. **Settings** tab: set the site name, contact email or Telegram id (used in Terms and Privacy), and review the 18+ alert text.
3. **Design** tab: pick a theme, add your photo URL, title and bio.
4. **Links** tab: add your buttons, drag to reorder, then press **Save**.
5. **Posts** tab: add posts (title, thumbnail URL, link).
6. **Settings -> Data reset -> Reset post views** (only if you had test or old views).
7. Open the site in another browser or phone to check everything.
8. Put your Instagram or YouTube bio link: `https://yourproject.pages.dev/?src=instagram`

> Images (photo, background, thumbnails, icons) are added by **URL**. Upload them anywhere that gives a direct image link (for example Imgur, ImgBB or a Telegram-hosted image link).

---

## Using the admin panel

| Tab | What it does |
|-----|--------------|
| **Links** | Add, edit, duplicate, hide and delete buttons. Hold the `⋮⋮` handle and drag to reorder. Toggle **Premium shine** for an animated gradient button. |
| **Posts** | Add posts with thumbnail, link and duration. Pin important ones to the top. Tapping a post opens its link directly. |
| **Design** | Themes, profile, background (colour / gradient / image with overlay and blur), fonts, text colour and button style, size, alignment and width. |
| **Settings** | Closed-page message, Posts options, 18+ alert, SEO, site name and contact, backup and restore, important links, data reset. |
| **Stats** | Visitors, sources, link clicks, top posts, country and device for 7, 30 or 90 days. |
| **Preview** | Phone preview (on desktop it is always visible on the right). |

Always press **Save** after changing links or design. The **Site ON/OFF** button applies instantly without pressing Save.

### Site ON / OFF
- Press **Site: ON** in the top bar to close the website. Visitors see your closed page (title and message are editable in Settings).
- While logged in you can still view the live site.
- Press **Site: OFF** to open it again.
- Other Cloudflare servers may take up to about 15 seconds to pick up the change.

### Backup and restore
- **Settings -> Backup & restore -> Download backup** saves your design and links as `page-backup.json`.
- **Restore backup** loads a file and replaces the current design. Posts are not included in the backup.
- Restoring never changes the ON/OFF state.

---

## Important URLs

| URL | Purpose |
|-----|---------|
| `/` | Home link page |
| `/posts` | Posts page |
| `/terms` | Terms & Conditions |
| `/privacy` | Privacy Policy |
| `/admin` | Admin panel (login required) |
| `/?src=instagram` | Home link with Instagram tracking |
| `/?src=telegram` | Home link with Telegram tracking |
| `/?src=youtube` | Home link with YouTube tracking |

You can use any word after `src=` (letters, numbers, `-` and `_`) to track your own campaigns.

---

## Analytics: what is counted and how

- **Visitor** = one device/browser, identified by a hashed IP + browser fingerprint. No cookies, no personal data. Known bots and link-preview crawlers are filtered.
- **Post view** = one visitor opening a post once per day.
- **Traffic source** comes from the referrer, the Instagram/Facebook in-app browser, or the `?src=` value. Apps that send no referrer (many Telegram and WhatsApp opens) appear as **Direct / Unknown**. Use tracked links for accurate numbers.
- **Country** is approximate and comes from the IP address.
- **Active now** = visitors in the last 30 minutes.
- Your own visits (including opening the admin site while testing) are counted.

These numbers are reliable for trends but are not 100% exact like a paid analytics tool.

---

## Updating the site

1. Edit `_worker.js` in your GitHub repo and commit.
2. Cloudflare redeploys automatically.
3. Your data (links, design, posts, stats) stays in D1 and is not lost.

---

## Security tips

- Use a long, unique `ADMIN_PASSWORD` and store it as a **Secret** (not plain text).
- Never share screenshots of your Cloudflare Variables page.
- Change the password if you think it was exposed (edit the secret, then redeploy).
- Do not commit passwords or secrets to GitHub.
- The admin cookie is `HttpOnly`, `Secure` and `SameSite=Strict`, and lasts 7 days.

---

## Free plan limits

Cloudflare free plan (at the time of writing, check Cloudflare for current numbers):
- Workers / Pages Functions: about 100,000 requests per day
- D1: millions of reads and 100,000 writes per day, 5 GB storage

This is plenty for a small or medium site. Each visit makes a small number of database writes for analytics.

---

## Troubleshooting

**`D1 binding "DB" missing`**
Check that the binding variable name is exactly `DB` (capital), points to `sitedb`, and then **retry the deployment** (bindings apply only to new deployments).

**Admin login fails**
Confirm `ADMIN_PASSWORD` and `SESSION_SECRET` both exist (type **Secret**) and that you redeployed after adding them.

**Build error: `Could not detect a directory containing static files`**
You created a **Workers** project with `npx wrangler deploy` but gave it no config. Either add a `wrangler.jsonc` (see the Workers setup) or create a **Pages** project instead.

**Build error: `The entry-point file at "worker.js" was not found`**
The file name in `wrangler.jsonc` (`main`) does not match the file in the repo root. Rename the file or change `main` (for example `"main": "_worker.js"`).

**My account name appears in the URL**
That is how `*.workers.dev` URLs work. Use Cloudflare **Pages** (`*.pages.dev`) or add a custom domain.

**Changes do not show up**
Press **Save** in the admin panel. If you edited the code, make sure the new commit finished deploying (Deployments tab).

**Images do not load**
Use a direct image link that starts with `https://` and opens as a picture in the browser.

**Preview shows no latest posts**
The latest-posts section only appears on the real home page, not in the admin preview.

---

## Responsible use

This project is a tool for sharing **your own** links and content.

- Only share content you own or have clear permission to share.
- Do not post private, non-consensual or leaked material, and do not promote it.
- Keep the 18+ alert enabled if your content is for adults only.
- Keep the contact field in Settings filled in so people can send takedown requests, and remove reported content promptly.
- You are responsible for following the laws of your country and the rules of Telegram, YouTube, Instagram and any other platform you link to.

---

## Credits

**Developer:** Durgesh Pandey
**Telegram channel:** <https://t.me/Luxtechzones>

If this project helped you, join the Telegram channel for more tutorials, tools and bots.
