import crypto from "node:crypto";
import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import { dbConfigured, getPrisma } from "./db.js";
import { sendVerificationEmail } from "./mail.js";

const ACCESS_TTL = "15m";
const REFRESH_DAYS = 30;
const VERIFY_HOURS = 48;

function jwtSecret() {
  const s = String(process.env.AUTH_JWT_SECRET || "").trim();
  if (!s || s.length < 16) {
    throw new Error("AUTH_JWT_SECRET must be set (min 16 chars)");
  }
  return new TextEncoder().encode(s);
}

function appPublicUrl() {
  return String(process.env.APP_PUBLIC_URL || "http://localhost:3001").replace(
    /\/+$/,
    ""
  );
}

function mobileRedirect() {
  return String(
    process.env.MOBILE_AUTH_REDIRECT || "moviehunter://account"
  ).trim();
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    email_verified: Boolean(user.emailVerifiedAt),
    display_name: user.displayName,
    avatar_url: user.avatarUrl,
  };
}

async function signAccessToken(user) {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    email_verified: Boolean(user.emailVerifiedAt),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(jwtSecret());
}

async function createSession(userId, userAgent) {
  const prisma = getPrisma();
  const refreshToken = randomToken();
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt,
      userAgent: userAgent ? String(userAgent).slice(0, 240) : null,
    },
  });
  return { refreshToken, expiresAt };
}

async function issueTokens(user, userAgent) {
  const accessToken = await signAccessToken(user);
  const { refreshToken, expiresAt } = await createSession(user.id, userAgent);
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt.toISOString(),
    token_type: "Bearer",
    user: publicUser(user),
  };
}

export async function requireUser(request) {
  const header = request.headers.get("authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false, status: 401, error: "Missing bearer token" };
  try {
    const { payload } = await jwtVerify(m[1].trim(), jwtSecret());
    const userId = String(payload.sub || "");
    if (!userId) return { ok: false, status: 401, error: "Invalid token" };
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { ok: false, status: 401, error: "User not found" };
    return { ok: true, user };
  } catch {
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }
}

async function createAndSendVerifyToken(user) {
  const prisma = getPrisma();
  const raw = randomToken();
  await prisma.emailToken.deleteMany({
    where: { userId: user.id, purpose: "verify" },
  });
  await prisma.emailToken.create({
    data: {
      userId: user.id,
      purpose: "verify",
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + VERIFY_HOURS * 60 * 60 * 1000),
    },
  });
  const verifyUrl = `${appPublicUrl()}/auth/callback?verify=${encodeURIComponent(raw)}&email=${encodeURIComponent(user.email)}`;
  await sendVerificationEmail({ to: user.email, verifyUrl });
  return raw;
}

export async function handleSignup(request) {
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const displayName = String(body.display_name || body.displayName || "").trim() || null;

  if (!validEmail(email)) {
    return { status: 400, body: { error: "Valid email required" } };
  }
  if (password.length < 8) {
    return { status: 400, body: { error: "Password must be at least 8 characters" } };
  }

  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // If Google-only account, allow setting password + send verify if needed
    if (!existing.passwordHash) {
      const passwordHash = await argon2.hash(password);
      const user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          displayName: displayName || existing.displayName,
        },
      });
      if (!user.emailVerifiedAt) {
        await createAndSendVerifyToken(user).catch((e) =>
          console.error("[auth/signup] mail", e)
        );
      }
      const tokens = await issueTokens(user, request.headers.get("user-agent"));
      return {
        status: 200,
        body: {
          ok: true,
          linked: true,
          message: user.emailVerifiedAt
            ? "Password set on existing Google account"
            : "Password set — check email to verify",
          ...tokens,
        },
      };
    }
    return { status: 409, body: { error: "Email already registered" } };
  }

  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName,
    },
  });

  try {
    await createAndSendVerifyToken(user);
  } catch (err) {
    console.error("[auth/signup] mail", err);
  }

  const tokens = await issueTokens(user, request.headers.get("user-agent"));
  return {
    status: 201,
    body: {
      ok: true,
      message: "Account created — check your email to verify",
      ...tokens,
    },
  };
}

export async function handleLogin(request) {
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  if (!validEmail(email) || !password) {
    return { status: 400, body: { error: "Email and password required" } };
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) {
    return { status: 401, body: { error: "Invalid email or password" } };
  }
  const ok = await argon2.verify(user.passwordHash, password);
  if (!ok) {
    return { status: 401, body: { error: "Invalid email or password" } };
  }

  const tokens = await issueTokens(user, request.headers.get("user-agent"));
  return { status: 200, body: { ok: true, ...tokens } };
}

export async function handleLogout(request) {
  if (!dbConfigured()) {
    return { status: 200, body: { ok: true } };
  }
  const body = await request.json().catch(() => ({}));
  const refresh = String(body.refresh_token || "").trim();
  if (refresh) {
    const prisma = getPrisma();
    await prisma.session.deleteMany({
      where: { refreshTokenHash: hashToken(refresh) },
    });
  }
  return { status: 200, body: { ok: true } };
}

export async function handleRefresh(request) {
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const body = await request.json().catch(() => ({}));
  const refresh = String(body.refresh_token || "").trim();
  if (!refresh) {
    return { status: 400, body: { error: "refresh_token required" } };
  }

  const prisma = getPrisma();
  const session = await prisma.session.findFirst({
    where: { refreshTokenHash: hashToken(refresh) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    }
    return { status: 401, body: { error: "Invalid refresh token" } };
  }

  await prisma.session.delete({ where: { id: session.id } });
  const tokens = await issueTokens(
    session.user,
    request.headers.get("user-agent")
  );
  return { status: 200, body: { ok: true, ...tokens } };
}

export async function handleVerifyEmail(request) {
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const body = await request.json().catch(() => ({}));
  const token = String(body.token || "").trim();
  if (!token) {
    return { status: 400, body: { error: "token required" } };
  }

  const prisma = getPrisma();
  const row = await prisma.emailToken.findFirst({
    where: {
      purpose: "verify",
      tokenHash: hashToken(token),
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });
  if (!row) {
    return { status: 400, body: { error: "Invalid or expired verification token" } };
  }

  const user = await prisma.user.update({
    where: { id: row.userId },
    data: { emailVerifiedAt: new Date() },
  });
  await prisma.emailToken.deleteMany({
    where: { userId: row.userId, purpose: "verify" },
  });

  return {
    status: 200,
    body: { ok: true, user: publicUser(user) },
  };
}

export async function handleResendVerification(request) {
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  if (auth.user.emailVerifiedAt) {
    return { status: 200, body: { ok: true, message: "Already verified" } };
  }
  try {
    await createAndSendVerifyToken(auth.user);
  } catch (err) {
    console.error("[auth/resend]", err);
    return { status: 502, body: { error: "Failed to send email" } };
  }
  return { status: 200, body: { ok: true, message: "Verification email sent" } };
}

export async function handleMe(request) {
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  const prisma = getPrisma();
  const accounts = await prisma.oAuthAccount.findMany({
    where: { userId: auth.user.id },
    select: { provider: true },
  });
  return {
    status: 200,
    body: {
      ok: true,
      user: publicUser(auth.user),
      providers: accounts.map((a) => a.provider),
      has_password: Boolean(auth.user.passwordHash),
    },
  };
}

export async function handleSetPassword(request) {
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  const body = await request.json().catch(() => ({}));
  const password = String(body.password || "");
  if (password.length < 8) {
    return { status: 400, body: { error: "Password must be at least 8 characters" } };
  }
  const passwordHash = await argon2.hash(password);
  const user = await getPrisma().user.update({
    where: { id: auth.user.id },
    data: { passwordHash },
  });
  return { status: 200, body: { ok: true, user: publicUser(user) } };
}

function googleConfigured() {
  return Boolean(
    String(process.env.GOOGLE_CLIENT_ID || "").trim() &&
      String(process.env.GOOGLE_CLIENT_SECRET || "").trim()
  );
}

function googleRedirectUri(request) {
  const configured = String(process.env.GOOGLE_REDIRECT_URI || "").trim();
  if (configured) return configured;
  const url = new URL(request.url);
  const fwdHost = request.headers.get("x-forwarded-host");
  const fwdProto = request.headers.get("x-forwarded-proto") || "https";
  if (fwdHost) {
    return `${fwdProto}://${fwdHost}/api/auth/google/callback`;
  }
  return `${url.origin}/api/auth/google/callback`;
}

export async function handleGoogleStart(request) {
  if (!googleConfigured()) {
    return { status: 503, body: { error: "Google OAuth not configured" } };
  }
  const url = new URL(request.url);
  const client = url.searchParams.get("client") || "web";
  const link = url.searchParams.get("link") === "1";
  const statePayload = Buffer.from(
    JSON.stringify({
      n: randomToken().slice(0, 16),
      client,
      link,
      ts: Date.now(),
    })
  ).toString("base64url");

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state: statePayload,
  });

  return {
    status: 302,
    redirect: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
  };
}

async function upsertGoogleUser(profile, { linkUserId = null } = {}) {
  const prisma = getPrisma();
  const email = normalizeEmail(profile.email);
  const providerUserId = String(profile.sub || profile.id || "");
  if (!email || !providerUserId) {
    throw new Error("Google profile missing email/id");
  }

  const existingOauth = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerUserId: { provider: "google", providerUserId },
    },
    include: { user: true },
  });
  if (existingOauth) {
    return existingOauth.user;
  }

  if (linkUserId) {
    const user = await prisma.user.findUnique({ where: { id: linkUserId } });
    if (!user) throw new Error("Link user not found");
    await prisma.oAuthAccount.create({
      data: { provider: "google", providerUserId, userId: user.id },
    });
    if (!user.emailVerifiedAt && user.email === email) {
      return prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: new Date(),
          displayName: user.displayName || profile.name || null,
          avatarUrl: user.avatarUrl || profile.picture || null,
        },
      });
    }
    return user;
  }

  // Same-email linking
  let user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    await prisma.oAuthAccount.create({
      data: { provider: "google", providerUserId, userId: user.id },
    });
    return prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: user.emailVerifiedAt || new Date(),
        displayName: user.displayName || profile.name || null,
        avatarUrl: user.avatarUrl || profile.picture || null,
      },
    });
  }

  user = await prisma.user.create({
    data: {
      email,
      emailVerifiedAt: new Date(),
      displayName: profile.name || null,
      avatarUrl: profile.picture || null,
      oauthAccounts: {
        create: { provider: "google", providerUserId },
      },
    },
  });
  return user;
}

export async function handleGoogleCallback(request) {
  if (!dbConfigured() || !googleConfigured()) {
    return { status: 503, body: { error: "Google OAuth / DB not configured" } };
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state") || "";
  let state = { client: "web", link: false };
  try {
    state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
  } catch {
    /* ignore */
  }

  if (!code) {
    return { status: 400, body: { error: "Missing code" } };
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(request),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "");
    return {
      status: 502,
      body: { error: "Google token exchange failed", detail: text.slice(0, 200) },
    };
  }
  const tokenJson = await tokenRes.json();
  const access = tokenJson.access_token;
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!profileRes.ok) {
    return { status: 502, body: { error: "Failed to load Google profile" } };
  }
  const profile = await profileRes.json();

  let linkUserId = null;
  if (state.link) {
    const auth = await requireUser(request);
    if (auth.ok) linkUserId = auth.user.id;
  }

  const user = await upsertGoogleUser(profile, { linkUserId });
  const tokens = await issueTokens(user, request.headers.get("user-agent"));

  const client = state.client === "mobile" ? "mobile" : "web";
  if (client === "mobile") {
    const redirect = new URL(mobileRedirect());
    redirect.searchParams.set("access_token", tokens.access_token);
    redirect.searchParams.set("refresh_token", tokens.refresh_token);
    return { status: 302, redirect: redirect.toString() };
  }

  const redirect = new URL(`${appPublicUrl()}/auth/callback`);
  redirect.searchParams.set("access_token", tokens.access_token);
  redirect.searchParams.set("refresh_token", tokens.refresh_token);
  return { status: 302, redirect: redirect.toString() };
}

export async function handleLinkGoogle(request) {
  if (!googleConfigured()) {
    return { status: 503, body: { error: "Google OAuth not configured" } };
  }
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  const url = new URL(request.url);
  url.pathname = "/api/auth/google/start";
  url.searchParams.set("link", "1");
  url.searchParams.set("client", url.searchParams.get("client") || "web");
  // Encode link user into state via start — but start doesn't know user.
  // Use Authorization on callback instead: client must call start while logged in
  // and callback will read Bearer. For browser redirect, pass a short-lived link token.
  const linkToken = await new SignJWT({ sub: auth.user.id, purpose: "link_google" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(jwtSecret());

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state: Buffer.from(
      JSON.stringify({
        n: randomToken().slice(0, 16),
        client: url.searchParams.get("client") || "web",
        link: true,
        link_token: linkToken,
        ts: Date.now(),
      })
    ).toString("base64url"),
  });

  return {
    status: 200,
    body: {
      ok: true,
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    },
  };
}

// Patch Google callback to honor link_token in state
const _origGoogleCallback = handleGoogleCallback;
export async function handleGoogleCallbackWithLink(request) {
  const url = new URL(request.url);
  const stateRaw = url.searchParams.get("state") || "";
  let linkUserId = null;
  try {
    const state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
    if (state.link_token) {
      const { payload } = await jwtVerify(state.link_token, jwtSecret());
      if (payload.purpose === "link_google") {
        linkUserId = String(payload.sub || "");
      }
    }
  } catch {
    /* fall through */
  }

  if (!linkUserId) {
    return _origGoogleCallback(request);
  }

  // Re-run callback logic with forced link user — duplicate minimal path
  if (!dbConfigured() || !googleConfigured()) {
    return { status: 503, body: { error: "Google OAuth / DB not configured" } };
  }
  const code = url.searchParams.get("code");
  if (!code) return { status: 400, body: { error: "Missing code" } };

  let state = { client: "web" };
  try {
    state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
  } catch {
    /* ignore */
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(request),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    return { status: 502, body: { error: "Google token exchange failed" } };
  }
  const tokenJson = await tokenRes.json();
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!profileRes.ok) {
    return { status: 502, body: { error: "Failed to load Google profile" } };
  }
  const profile = await profileRes.json();
  const user = await upsertGoogleUser(profile, { linkUserId });
  const tokens = await issueTokens(user, request.headers.get("user-agent"));
  const client = state.client === "mobile" ? "mobile" : "web";
  if (client === "mobile") {
    const redirect = new URL(mobileRedirect());
    redirect.searchParams.set("access_token", tokens.access_token);
    redirect.searchParams.set("refresh_token", tokens.refresh_token);
    return { status: 302, redirect: redirect.toString() };
  }
  const redirect = new URL(`${appPublicUrl()}/auth/callback`);
  redirect.searchParams.set("access_token", tokens.access_token);
  redirect.searchParams.set("refresh_token", tokens.refresh_token);
  return { status: 302, redirect: redirect.toString() };
}
