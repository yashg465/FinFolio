# FinFolio

A finance portfolio community with a Node.js backend and responsive frontend. No third-party runtime packages are required.

## Run locally

Requires Node.js 24 (Docker pins this version).

```sh
npm run check
npm test
npm start
```

The app and API use port 3000, or `PORT`. `DATA_DIR` selects persistent storage (default `.data`). Profiles, projects, likes, attachment metadata, and hashed session tokens are stored in an atomically replaced JSON file. Uploaded file bytes live in `DATA_DIR/uploads`. Back up and retain the entire data directory together. Use one server instance; this storage is for a small demonstration, not production scaling. Back up the data directory. Do not expose or commit it.

## Test the app

1. Create a demo profile. Enter a test email, use `123456` for the email demo OTP, then enter your name and choose a unique username. No mobile number is requested. No email is sent; the email is held only in a temporary in-memory challenge and is not stored in the database.
2. Edit your name/headline and add a project with up to five supporting files and an optional HTTP/HTTPS resource link.
3. Preview your portfolio and copy its profile link. Open that URL in a separate browser to verify public viewing. Project share links work across browsers too.
4. The originating browser retains edit access through an HttpOnly, SameSite session cookie for seven days. There is no returning-user login or recovery yet; losing that session means losing edit access. Do not use this demo for real accounts or confidential material.
5. Sample showcases remain illustrative; their attachments are not real documents. Sample likes are browser-local; real project likes are server-backed.

Existing projects from the older localStorage-only prototype are not migrated automatically.

## Deploy to a separate URL

Deployment is not performed by creating these files. Choose a Docker-capable host with HTTPS and a persistent disk.

### Render example

`render.yaml` provides a single Docker web service with a persistent disk mounted at `/data`. Persistent disks require a suitable paid hosting plan; check current provider pricing.

1. Commit and push this repository to your GitHub account.
2. In Render, create a Blueprint from this repository and review the proposed service and disk costs.
3. Deploy the service. Render supplies the HTTPS service URL after deployment.
4. Open that URL and follow the test steps above, including a second browser.

For another host, build the included Dockerfile, mount persistent storage at `/data`, route HTTPS to the container's port, and run exactly one instance. Set `NODE_ENV=production` for secure cookies. The reverse proxy must supply `X-Forwarded-Proto: https` and preserve the request host. The service accepts its hosting-assigned `PORT`.

```sh
docker build -t finfolio .
docker run --rm -p 3000:3000 -e NODE_ENV=development -v finfolio-data:/data finfolio
```

The Docker commands are provided for deployment and have not been executed in this environment. Local plain HTTP needs development mode because secure cookies require HTTPS.

## API

- `GET /api/state`: public projects and current session's profile/likes.
- `POST /api/signup/start`: starts a short-lived email demo challenge.
- `POST /api/signup/verify`: checks the demo email OTP.
- `POST /api/demo-signup`: consumes a verified challenge, reserves a unique username, and creates a browser session; not real email verification.
- `GET /api/profiles?username=...`: searches all profiles by username, including profiles without projects.
- `PATCH /api/profile`: edits only the current session's profile.
- `POST /api/projects`: creates a project owned by the current session.
- `POST /api/projects/:id/like`: toggles a current user's like.
- `GET /api/profiles/:idOrUsername`: public profile and its projects. Existing ID-based links remain supported.

Writes require JSON and reject mismatched browser origins. Input lengths and resource link schemes are validated server-side. Session cookies are HttpOnly, SameSite=Lax, and Secure in production. This is a test implementation, not production-ready authentication.

## Before production

Replace demo verification with real email OTP and rate limits, add login/recovery/logout, use a transactional database, move uploads to scanned object storage, reporting/moderation, account deletion, and privacy controls. Set up monitoring, backups, abuse controls, and HTTPS. Only share material you own and can disclose. Fonts optionally load from Google Fonts with system fallbacks. Sample content is not investment advice.

## Supporting files and the dark UI

Projects accept up to **5 nonempty files, 8 MB each**, with a shared demo storage limit of 250 MB. Attach images, PDFs, presentations, spreadsheets, or other file types using the file picker; links remain optional. Remove any selected file before publishing. All attachments are visible to visitors who can access the project. Only upload work you can disclose.

JPEG, PNG, GIF, and WebP images display inline. PDFs use the browser's PDF viewer where supported; every file also has a download action. Other formats, including HTML and SVG, download as binary attachments rather than executing inline. File names are displayed as escaped text; storage uses generated IDs. Preview MIME types are determined from file signatures, not the supplied extension. No malware scanning or document conversion is provided. This remains a demo; use trusted test files.

A **Supporting files** section appears on each article and portfolio, including public profiles. Existing projects without files still work. Open a project, choose **View full** to expand the article over the current page, **View small** to shrink it, or **Back** / Escape to close it.

The black theme includes a longer landing page, swipeable profile and project rails, navigation arrows, search, category filters, and responsive mobile layouts. Swipe horizontally on a touch device or use the arrow buttons with a mouse/keyboard.

`npm test` exercises uploads, limits, safe HTML download handling, unauthorized writes, byte-for-byte image retrieval, and persistence across a server restart using isolated temporary data. Browser checks additionally covered file selection/removal, publishing, portfolio supporting files, full/small/back article controls, mobile filtering/search, and carousel navigation.

## Usernames and profile search

Use **Search profiles** in the top navigation or **Search @username** beside the profile cards. Search accepts partial usernames and an optional leading `@`, ignores case, and returns up to 30 matches with exact matches first. It searches registered accounts, including accounts with no projects. Sample profiles are illustrative and are not registered accounts.

Usernames are unique across the server, stored in lowercase, and accept 3–30 ASCII letters, numbers, or underscores. They are chosen after the email demo OTP step. Duplicate names show an inline error without losing the form. Usernames are currently fixed after registration; display names and headlines remain editable. Existing accounts receive deterministic unique usernames on startup without losing projects or sessions. Profiles show `@username`, and new copied profile links use it; older ID links still work.

Resource links show the full destination URL directly below the **Open linked resource** button, before the user clicks it. The visible destination is the supplied URL; an external site's subsequent redirects are outside FinFolio's control.

The email challenge expires after ten minutes or a server restart, is single-use for registration, and allows five OTP attempts. This is explicitly a demo with the fixed email code `123456`, not a production email verification service. No mobile number or mobile OTP is used.
