
import path from 'path';

export interface TokenData {
  pathPrefix: string; // Path relative to UPLOADS_DIR. Directory paths end with '/'. Empty string for root.
  expiry: number; // Timestamp, or Number.MAX_SAFE_INTEGER for never expires
  token: string;
}

// In-memory store for active tokens. In a real app, use a persistent store.
const activeTokens = new Map<string, TokenData>();

// Default token expiry: 24 hours
const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;

export function generateToken(rawPathPrefix: string, expiresInMsParam?: number): TokenData {
  let processedPrefix = rawPathPrefix.trim().replace(/\\/g, '/'); // Use forward slashes

  // If it's an absolute path (starts with /), treat as relative to UPLOADS_DIR root.
  if (processedPrefix.startsWith('/')) {
    processedPrefix = processedPrefix.substring(1);
  }
  
  // Normalize to remove redundant . or .. segments AFTER making it relative
  // path.posix.normalize('') results in '.'
  // path.posix.normalize('/') results in '/'
  // path.posix.normalize('foo//bar') results in 'foo/bar'
  processedPrefix = path.posix.normalize(processedPrefix);

  if (processedPrefix === '.' || processedPrefix === '/') { 
      // Treat '.' (from normalizing empty or '/') or an explicit '/' as root access
      processedPrefix = ''; 
  } else if (processedPrefix && !path.posix.extname(processedPrefix) && !processedPrefix.endsWith('/')) {
    // If it's not root, has no extension, and doesn't end with a slash, assume directory and add trailing slash
    processedPrefix += '/';
  }
  
  const token = crypto.randomUUID();
  let calculatedExpiry: number;

  if (expiresInMsParam === 0) {
    calculatedExpiry = Number.MAX_SAFE_INTEGER; // Never expire
  } else if (expiresInMsParam !== undefined) {
    calculatedExpiry = Date.now() + expiresInMsParam; // Use provided duration
  } else {
    calculatedExpiry = Date.now() + DEFAULT_EXPIRY_MS; // Use default
  }
  
  const tokenData: TokenData = { pathPrefix: processedPrefix, expiry: calculatedExpiry, token };
  activeTokens.set(token, tokenData);
  
  console.log(`Generated token: ${token} for prefix: '${processedPrefix}', expiry: ${calculatedExpiry === Number.MAX_SAFE_INTEGER ? 'Never Expires' : new Date(calculatedExpiry).toISOString()}`);
  return tokenData;
}

export function validateToken(token: string, requestedCanonicalPath: string): TokenData | null {
  const tokenData = activeTokens.get(token);

  if (!tokenData) {
    console.log(`Token validation failed: token ${token} not found.`);
    return null;
  }

  if (tokenData.expiry !== Number.MAX_SAFE_INTEGER && Date.now() > tokenData.expiry) {
    activeTokens.delete(token); // Clean up expired token
    console.log(`Token validation failed: token ${token} expired.`);
    return null;
  }

  // tokenData.pathPrefix is already normalized (e.g., "", "folder/", "file.txt")
  const tokenPrefix = tokenData.pathPrefix;

  // Normalize the requested path (which might be '.', 'file.txt', 'folder/file.txt')
  // It should already be using forward slashes from the route handler.
  let normalizedReqPath = path.posix.normalize(requestedCanonicalPath.replace(/\\/g, '/'));
  if (normalizedReqPath === '.') {
    normalizedReqPath = ''; // Treat '.' (often from path.join on empty segments) as root access ''
  }

  const isTokenForDirectory = tokenPrefix.endsWith('/') || tokenPrefix === '';

  if (isTokenForDirectory) {
    // Token is for a directory (e.g., "" for root, or "folder/")
    // The requested path must be *within* or *equal to* this directory prefix.
    if (tokenPrefix === '') {
      // Root token: allows access to any path within UPLOADS_DIR.
      // File system operations will further validate existence.
    } else {
      // Specific directory token (e.g., "folder/")
      // normalizedReqPath must start with tokenPrefix OR
      // normalizedReqPath + '/' must be equal to tokenPrefix (e.g. req "folder" for prefix "folder/")
      if (!normalizedReqPath.startsWith(tokenPrefix) && (normalizedReqPath + '/') !== tokenPrefix) {
        console.log(`Token validation failed: path '${normalizedReqPath}' not in directory prefix '${tokenPrefix}'`);
        return null;
      }
    }
  } else {
    // Token is for a specific file (e.g., "file.txt")
    // The requested path must be exactly equal to the token's path.
    if (normalizedReqPath !== tokenPrefix) {
      console.log(`Token validation failed: path '${normalizedReqPath}' does not match specific file token '${tokenPrefix}'`);
      return null;
    }
  }
  
  console.log(`Token ${token} validated successfully for path '${normalizedReqPath}' with prefix '${tokenPrefix}'`);
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
    if (tokenData.expiry !== Number.MAX_SAFE_INTEGER && now > tokenData.expiry) {
      activeTokens.delete(token);
      console.log(`Cleaned up expired token: ${token}`);
    }
  }
}, 60 * 60 * 1000); // Check every hour
