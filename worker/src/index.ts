
/**
 * 
 * General outline:
 * fetch(request, env):
  url = new URL(request.url)

  if path is "/secure":
    token = header "Cf-Access-Jwt-Assertion"     → missing? 401
    verify token:
       keys     = remote JWKS from `${TEAM_DOMAIN}/cdn-cgi/access/certs`
       issuer   = TEAM_DOMAIN
       audience = POLICY_AUD                     → invalid? 403
    email     = payload.email
    timestamp = ?  (decide: now, or payload.iat = time of login)
    country   = request.cf?.country ?? "XX"
    return HTML:
       `${email} authenticated at ${timestamp} from <a href="/secure/${country}">${country}</a>`
       headers: Content-Type: text/html; charset=utf-8
                Cache-Control: private, no-store

  else:
    404 for now  (step 7c will handle /secure/XX)


	
 */


import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

// Cloudflare Access public keys, fetched once per Worker instance and cached by jose.
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJwks(env: Env) {
  jwks ??= createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`));
  return jwks;
}

// Verifies the Access token: signature, issuer (our team) and audience (our Access app).
async function verifyAccess(request: Request, env: Env): Promise<JWTPayload | null> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwks(env), {
      issuer: env.TEAM_DOMAIN,
      audience: env.POLICY_AUD,
    });
    return payload;
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/secure" || url.pathname === "/secure/") {
      const payload = await verifyAccess(request, env);
      if (!payload) return new Response("Forbidden", { status: 403 });

      const email = typeof payload.email === "string" ? payload.email : "unknown";
      const timestamp = new Date().toISOString();
      const country = (request.cf?.country as string | undefined) ?? "XX";

      const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Secure</title></head>
<body>
  <p>${escapeHtml(email)} authenticated at ${timestamp} from
     <a href="/secure/${encodeURIComponent(country)}">${escapeHtml(country)}</a></p>
</body>
</html>`;

      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      });
    }

    // /secure/<COUNTRY> comes in step 7c

    const match = url.pathname.match(/^\/secure\/([A-Za-z]{2})$/);
    if (match) {
      const payload = await verifyAccess(request, env);
      if (!payload) return new Response("Forbidden", { status: 403 });

      const code = match[1].toUpperCase();
      const flag = await env.FLAGS.get(`${code}.svg`);
      if (!flag) return new Response("Flag not found", { status: 404 });

      return new Response(flag.body, {
        headers: {
          "Content-Type": flag.httpMetadata?.contentType ?? "image/svg+xml",
          "Cache-Control": "private, max-age=3600",
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    return new Response("Not found", { status: 404 });


	return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;