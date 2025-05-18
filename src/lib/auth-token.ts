
import path from 'path';
import fs from 'fs/promises';
import { SQLiteDB } from 'multi-db-orm';

export interface TokenData {
  token: string;
  pathPrefix: string; // Path relative to UPLOADS_DIR. Directory paths end with '/'. Empty string for root.
  expiry: number; // Timestamp, or Number.MAX_SAFE_INTEGER for never expires
}

// Default token expiry: 24 hours
const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;
const TOKENS_TABLE_NAME = 'tokens';

const dbDir = path.join(process.cwd(), 'db');
const dbFilePath = path.join(dbDir, 'authtokens.sqlite');

let sqliteDb: SQLiteDB;

const dbInitializationPromise = (async () => {
  try {
    await fs.access(dbDir);
  } catch {
    await fs.mkdir(dbDir, { recursive: true });
    console.log(`Created database directory at ${dbDir}`);
  }

  sqliteDb = new SQLiteDB(dbFilePath);
  console.log(`SQLiteDB instance created for ${dbFilePath}`);

  // Ensure the table exists.
  // multi-db-orm's create is idempotent or handles existing tables gracefully.
  // The sample object defines the schema.
  try {
    // Check if table exists by trying to get a non-existent token
    // This is a workaround as multi-db-orm's create might throw if table exists or not clearly documented.
    // A more robust way would be to query sqlite_master if the ORM allowed raw queries or had a tableExists method.
    let tableExists = false;
    try {
        await sqliteDb.getOne(TOKENS_TABLE_NAME, { token: 'schema_check_dummy_token_non_existent' });
        tableExists = true; // If getOne doesn't throw, table (likely) exists
    } catch (e: any) {
        // Errors can mean table doesn't exist, or other issues.
        // A common error for non-existent table in SQLite is "no such table"
        if (e.message && e.message.toLowerCase().includes('no such table')) {
            tableExists = false;
        } else {
            // If it's another error, assume table might exist or there's a different problem
            // For simplicity, we'll try to create if we are unsure.
            // console.warn('Pre-check for table existence resulted in an unexpected error, will attempt creation:', e.message);
            // tableExists = true; // Let's try to create it anyway and see if `create` handles it.
        }
    }

    if (!tableExists) {
        console.log(`Table '${TOKENS_TABLE_NAME}' does not exist or check was inconclusive. Attempting to create...`);
        await sqliteDb.create(TOKENS_TABLE_NAME, {
            token: 'TEXT PRIMARY KEY', // Define types for SQLite
            pathPrefix: 'TEXT',
            expiry: 'INTEGER',
        });
        console.log(`Table '${TOKENS_TABLE_NAME}' created or schema ensured.`);
    } else {
        console.log(`Table '${TOKENS_TABLE_NAME}' likely already exists.`);
    }

  } catch (error) {
    console.error(`Error during table creation for '${TOKENS_TABLE_NAME}':`, error);
    throw error; // Propagate error if table creation fails critically
  }
  
  console.log('Token database initialized successfully using SQLite.');
})().catch(error => {
  console.error('Failed to initialize token database with SQLite:', error);
  throw error; 
});


export async function generateToken(rawPathPrefix: string, expiresInMsParam?: number): Promise<TokenData> {
  await dbInitializationPromise; 

  let processedPrefix = rawPathPrefix.trim().replace(/\\/g, '/');
  if (processedPrefix.startsWith('/')) {
    processedPrefix = processedPrefix.substring(1);
  }
  processedPrefix = path.posix.normalize(processedPrefix);
  if (processedPrefix === '.' || processedPrefix === '/') { 
      processedPrefix = ''; 
  } else if (processedPrefix && !path.posix.extname(processedPrefix) && !processedPrefix.endsWith('/')) {
    processedPrefix += '/';
  }
  
  const token = crypto.randomUUID();
  let calculatedExpiry: number;

  if (expiresInMsParam === 0) {
    calculatedExpiry = Number.MAX_SAFE_INTEGER;
  } else if (expiresInMsParam !== undefined) {
    calculatedExpiry = Date.now() + expiresInMsParam;
  } else {
    calculatedExpiry = Date.now() + DEFAULT_EXPIRY_MS;
  }
  
  const tokenEntry: TokenData = { token, pathPrefix: processedPrefix, expiry: calculatedExpiry };
  await sqliteDb.insert(TOKENS_TABLE_NAME, tokenEntry);
  
  console.log(`Generated token: ${token} for prefix: '${processedPrefix}', expiry: ${calculatedExpiry === Number.MAX_SAFE_INTEGER ? 'Never Expires' : new Date(calculatedExpiry).toISOString()}`);
  return tokenEntry;
}

export async function validateToken(token: string, requestedCanonicalPath: string): Promise<TokenData | null> {
  await dbInitializationPromise;

  const results = await sqliteDb.get(TOKENS_TABLE_NAME, { token });
  const tokenEntity = (results as TokenData[])[0] || null;


  if (!tokenEntity) {
    console.log(`Token validation failed: token ${token} not found.`);
    return null;
  }

  if (tokenEntity.expiry !== Number.MAX_SAFE_INTEGER && Date.now() > tokenEntity.expiry) {
    await sqliteDb.delete(TOKENS_TABLE_NAME, { token }); // Clean up expired token
    console.log(`Token validation failed: token ${token} expired and removed.`);
    return null;
  }

  const tokenPrefix = tokenEntity.pathPrefix;
  let normalizedReqPath = path.posix.normalize(requestedCanonicalPath.replace(/\\/g, '/'));
  if (normalizedReqPath === '.') {
    normalizedReqPath = '';
  }

  const isTokenForDirectory = tokenPrefix.endsWith('/') || tokenPrefix === '';

  if (isTokenForDirectory) {
    if (tokenPrefix === '') {
      // Root token allows any path
    } else {
      // Path must start with the prefix. Also handle cases like prefix 'foo/' and path 'foo' (which implies 'foo/')
      if (!normalizedReqPath.startsWith(tokenPrefix) && (normalizedReqPath + '/') !== tokenPrefix) {
        console.log(`Token validation failed: path '${normalizedReqPath}' not in directory prefix '${tokenPrefix}'`);
        return null;
      }
    }
  } else { // Token is for a specific file
    if (normalizedReqPath !== tokenPrefix) {
      console.log(`Token validation failed: path '${normalizedReqPath}' does not match specific file token '${tokenPrefix}'`);
      return null;
    }
  }
  
  console.log(`Token ${token} validated successfully for path '${normalizedReqPath}' with prefix '${tokenPrefix}'`);
  return tokenEntity;
}

export async function revokeToken(token: string): Promise<void> {
  await dbInitializationPromise; 
  await sqliteDb.delete(TOKENS_TABLE_NAME, { token });
  console.log(`Token ${token} revoked.`);
}

// Cleanup job for expired tokens
setInterval(async () => {
  try {
    await dbInitializationPromise; 
    const now = Date.now();
    
    // Get tokens where expiry < now
    // The multi-db-orm 'get' with 'apply' for range seems specific.
    // Example: { apply: { field: 'expiry', ineq: { op: '<', value: now } } }
    // The filter object (second param) is for exact matches.
    // So, we pass an empty filter {} to get all, then apply the range condition.
    const results = await sqliteDb.get(TOKENS_TABLE_NAME, {}, {
        apply: {
            field: 'expiry',
            ineq: { op: '<', value: now }
        }
    });
    
    const expiredTokens = (results as TokenData[]).filter(t => t.expiry !== Number.MAX_SAFE_INTEGER);


    if (expiredTokens.length > 0) {
      const tokensToDelete = expiredTokens.map(t => t.token);
      for (const tokenToDel of tokensToDelete) {
        await sqliteDb.delete(TOKENS_TABLE_NAME, { token: tokenToDel });
      }
      console.log(`Cleaned up ${expiredTokens.length} expired token(s): ${tokensToDelete.join(', ')}`);
    }
  } catch (error) {
    console.error('Error during expired token cleanup:', error);
  }
}, 60 * 60 * 1000); // Check every hour

