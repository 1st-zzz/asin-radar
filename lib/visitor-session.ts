const VISITOR_COOKIE = "asin_radar_visitor";
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export type VisitorSession = {
  userId: string;
  setCookie: string | null;
};

function cookieValue(header: string, name: string) {
  for (const part of header.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return valueParts.join("=");
  }
  return null;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`anonymous:${token}`),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function getVisitorSession(request: Request): Promise<VisitorSession> {
  const existing = cookieValue(request.headers.get("cookie") ?? "", VISITOR_COOKIE);
  const token = existing && TOKEN_PATTERN.test(existing) ? existing : randomToken();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return {
    userId: await hashToken(token),
    setCookie: existing === token
      ? null
      : `${VISITOR_COOKIE}=${token}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; HttpOnly; SameSite=Lax${secure}`,
  };
}

export function visitorJson(
  session: VisitorSession,
  body: unknown,
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers);
  if (session.setCookie) headers.append("set-cookie", session.setCookie);
  return Response.json(body, { ...init, headers });
}
