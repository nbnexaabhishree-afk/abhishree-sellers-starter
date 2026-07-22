const LOCAL_ORIGIN = "http://localhost:3001";

function parseOrigin(value: string | undefined) {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLocalOrigin(origin: string) {
  const hostname = new URL(origin).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function getRedirectOrigin(
  requestUrl: string | URL,
  env: Record<string, string | undefined> = process.env
) {
  const requestOrigin = new URL(requestUrl).origin;
  const configuredOrigin = parseOrigin(env.NEXT_PUBLIC_SITE_URL);

  if (isLocalOrigin(requestOrigin) || (configuredOrigin && isLocalOrigin(configuredOrigin))) {
    return LOCAL_ORIGIN;
  }

  return configuredOrigin ?? requestOrigin;
}

export function getRedirectUrl(path: string, requestUrl: string | URL) {
  return new URL(path, getRedirectOrigin(requestUrl));
}
