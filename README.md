# FinFolio

A finance portfolio community with a Node.js backend and responsive frontend. No third-party runtime packages are required.

## Run locally

Requires Node.js 24 (Docker pins this version).

```sh
npm run check
npm start
```

The app and API use port 3000, or `PORT`. `DATA_DIR` selects persistent storage (default `.data`). Profiles, projects, likes, and hashed session tokens are stored in an atomically replaced JSON file. Use one server instance; this storage is for a small demonstration, not production scaling. Back up the data directory. Do not expose or commit it.

## Test the app

1. Create a demo profile. Use fictional mobile/email details and `123456` for both demo OTP fields. No SMS/email is sent, and contact details are not stored.
2. Edit your name/headline and add a project with an optional HTTP/HTTPS resource link.
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
- `POST /api/demo-signup`: creates a demo identity and browser session; not real identity verification.
- `PATCH /api/profile`: edits only the current session's profile.
- `POST /api/projects`: creates a project owned by the current session.
- `POST /api/projects/:id/like`: toggles a current user's like.
- `GET /api/profiles/:id`: public profile and its projects.

Writes require JSON and reject mismatched browser origins. Input lengths and resource link schemes are validated server-side. Session cookies are HttpOnly, SameSite=Lax, and Secure in production. This is a test implementation, not production-ready authentication.

## Before production

Replace demo verification with real SMS/email OTP and rate limits, add login/recovery/logout, use a transactional database, add validated object-storage uploads, reporting/moderation, account deletion, and privacy controls. Set up monitoring, backups, abuse controls, and HTTPS. Only share material you own and can disclose. Fonts optionally load from Google Fonts with system fallbacks. Sample content is not investment advice.
