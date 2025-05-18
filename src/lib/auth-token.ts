import path from 'path';

export interface TokenData {
  pathPrefix: string; // Path relative to UPLOADS_DIR. Directory paths end with '/'.
  expiry: number; // Timestamp
  token: string;
}

// In-memory store for active tokens. In a real app, use a persistent store.
const activeTokens = new Map<string, TokenData>();

// Default token expiry: 24 hours
const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;

export function generateToken(rawPathPrefix: string, expiresInMs: number = DEFAULT_EXPIRY_MS): TokenData {
  // Normalize pathPrefix: ensure it's relative and clean.
  // If it's meant to be a directory, ensure it ends with a slash.
  let normalizedPrefix = path.normalize(rawPathPrefix.startsWith('/') ? rawPathPrefix.substring(1) : rawPathPrefix);
  
  // Heuristic: if no extension, assume directory and add trailing slash
  if (normalizedPrefix && !path.extname(normalizedPrefix) && !normalizedPrefix.endsWith(path.sep)) {
    normalizedPrefix += path.sep;
  }
  // Ensure consistent path separators (use POSIX for URLs)
  normalizedPrefix = normalizedPrefix.replace(/\\/g, '/');


  const token = crypto.randomUUID();
  const expiry = Date.now() + expiresInMs;
  const tokenData: TokenData = { pathPrefix: normalizedPrefix, expiry, token };
  activeTokens.set(token, tokenData);
  
  console.log(`Generated token: ${token} for prefix: ${normalizedPrefix}, expiry: ${new Date(expiry).toISOString()}`);
  return tokenData;
}

export function validateToken(token: string, requestedRelativePath: string): TokenData | null {
  const tokenData = activeTokens.get(token);

  if (!tokenData) {
    console.log(`Token validation failed: token ${token} not found.`);
    return null;
  }

  if (Date.now() > tokenData.expiry) {
    activeTokens.delete(token); // Clean up expired token
    console.log(`Token validation failed: token ${token} expired.`);
    return null;
  }

  const normalizedRequestedPath = path.normalize(requestedRelativePath).replace(/\\/g, '/');
  const normalizedTokenPrefix = path.normalize(tokenData.pathPrefix).replace(/\\/g, '/');

  const isTokenForDirectory = normalizedTokenPrefix.endsWith('/');

  if (isTokenForDirectory) {
    // For directory token, requested path must be within or be the directory itself
    if (!normalizedRequestedPath.startsWith(normalizedTokenPrefix) && normalizedRequestedPath + '/' !== normalizedTokenPrefix) {
      console.log(`Token validation failed: path ${normalizedRequestedPath} not in prefix ${normalizedTokenPrefix}`);
      return null;
    }
  } else { // Token is for a specific file
    if (normalizedRequestedPath !== normalizedTokenPrefix) {
      console.log(`Token validation failed: path ${normalizedRequestedPath} does not match specific file token ${normalizedTokenPrefix}`);
      return null;
    }
  }
  
  console.log(`Token ${token} validated successfully for path ${normalizedRequestedPath}`);
  return tokenData;
}

export function revokeToken(token: string): void {
  activeTokens.delete(token);
  console.log(`Token ${token} revoked.`);
}

// Cleanup job for expired tokens (optional, good practice for long-running servers)
setInterval(() => {
  const now = Date.now();
  for (const [token, tokenData] of activeTokens.entries()) {
    if (now > tokenData.expiry) {
      activeTokens.delete(token);
      console.log(`Cleaned up expired token: ${token}`);
    }
  }
}, 60 * 60 * 1000); // Check every hour
