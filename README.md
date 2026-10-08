# cloudflare-application-services-assignment

A small origin server behind Cloudflare, plus a Worker that serves an authenticated `/secure` page protected by Cloudflare Access.

## Layout

```
origin/          docker-compose for the origin app (traefik/whoami on 127.0.0.1:8080)
proxy/nginx/     nginx config for headers.interlinked.dev (TLS via Let's Encrypt → whoami)
worker/          Cloudflare Worker serving tunnel.interlinked.dev/secure*
scripts/         helper script that uploads country flags to R2
```

## Worker

The Worker runs on `tunnel.interlinked.dev/secure*`. Cloudflare Access sits in front of it, and every request also gets checked inside the Worker: it verifies the `Cf-Access-Jwt-Assertion` JWT against the Access public keys (JWKS), the team domain (`iss`) and the application AUD tag (`aud`). If any check fails, the Worker returns `403`.

| Route | Response |
| --- | --- |
| `GET /secure` | HTML page: `<email> authenticated at <timestamp> from <COUNTRY>`, where the country links to `/secure/<COUNTRY>` |
| `GET /secure/<CC>` | That country's flag SVG, read from the private R2 bucket |

The country comes from `request.cf.country`. Flags are served with a strict `Content-Security-Policy` and `nosniff`.

### Configuration

Everything is in [`worker/wrangler.jsonc`](worker/wrangler.jsonc):

- `vars.TEAM_DOMAIN`: the Access team domain, e.g. `https://<team>.cloudflareaccess.com`
- `vars.POLICY_AUD`: the AUD tag of the Access application
- `r2_buckets`: the `FLAGS` binding to the `cloudflare-assignment-flags` bucket

After changing vars or bindings, regenerate the `Env` types with `npm run cf-typegen`.

### Develop and deploy

```sh
cd worker
npm install
npm run dev       # local dev server
npm test          # vitest
npm run deploy    # wrangler deploy
```

## Uploading flags

```sh
./scripts/upload-flags.sh            # defaults to cloudflare-assignment-flags
./scripts/upload-flags.sh <bucket>   # or upload to another bucket
```

This downloads [flag-icons](https://github.com/lipis/flag-icons) v7.5.0 (MIT) and uploads each flag to R2 as `<CC>.svg`, e.g. `DE.svg`. Run `npm install` in `worker/` first, since the script uses that Wrangler install.

## Origin

```sh
cd origin && docker compose up -d
```

This serves whoami on `127.0.0.1:8080`. [`proxy/nginx/headers.conf`](proxy/nginx/headers.conf) terminates TLS for `headers.interlinked.dev` and proxies requests to it.
