import fs from 'fs/promises';
import path from 'path';

export const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Ensure uploads directory exists on module load
(async () => {
  try {
    await fs.access(UPLOADS_DIR);
  } catch {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    console.log(`Created uploads directory at ${UPLOADS_DIR}`);
  }
})();

function sanitizePath(relativePath: string): string {
  // Normalize and prevent path traversal
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  return path.join(UPLOADS_DIR, normalized);
}

export interface FileSystemItem {
  name: string;
  type: 'file' | 'folder';
  path: string; // Relative path from UPLOADS_DIR
  size?: number;
  lastModified?: Date;
}

export async function listDirectoryContents(relativePath: string = ''): Promise<FileSystemItem[]> {
  const absolutePath = sanitizePath(relativePath);
  await fs.mkdir(absolutePath, { recursive: true }); // Ensure directory exists

  try {
    const items = await fs.readdir(absolutePath, { withFileTypes: true });
    const detailedItems: FileSystemItem[] = [];

    for (const item of items) {
      const itemPath = path.join(relativePath, item.name);
      const stats = await fs.stat(path.join(absolutePath, item.name));
      detailedItems.push({
        name: item.name,
        type: item.isDirectory() ? 'folder' : 'file',
        path: itemPath.replace(/\\/g, '/'), // Ensure POSIX paths for consistency
        size: item.isFile() ? stats.size : undefined,
        lastModified: stats.mtime,
      });
    }
    return detailedItems.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'folder' ? -1 : 1;
    });
  } catch (error: any) {
    if (error.code === 'ENOENT') return []; // Directory does not exist, return empty
    console.error(`Error listing directory ${absolutePath}:`, error);
    throw error;
  }
}

export async function writeFile(relativePath: string, data: Buffer): Promise<void> {
  const absolutePath = sanitizePath(relativePath);
  const dirName = path.dirname(absolutePath);
  await fs.mkdir(dirName, { recursive: true });
  await fs.writeFile(absolutePath, data);
}

export async function readFile(relativePath: string): Promise<Buffer> {
  const absolutePath = sanitizePath(relativePath);
  return fs.readFile(absolutePath);
}

export async function getFileStream(relativePath: string): Promise<ReadableStream<Uint8Array>> {
  const absolutePath = sanitizePath(relativePath);
  const { readable, writable } = new TransformStream();
  const fileStream = (await import('fs')).createReadStream(absolutePath);

  fileStream.on('data', (chunk) => writable.getWriter().write(chunk));
  fileStream.on('end', () => writable.getWriter().close());
  fileStream.on('error', (err) => writable.getWriter().abort(err));
  
  return readable;
}

export async function getFileStats(relativePath: string): Promise<import('fs').Stats | null> {
  const absolutePath = sanitizePath(relativePath);
  try {
    return await fs.stat(absolutePath);
  } catch (error: any) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function deleteItem(relativePath: string): Promise<void> {
  const absolutePath = sanitizePath(relativePath);
  try {
    const stats = await fs.stat(absolutePath);
    if (stats.isDirectory()) {
      await fs.rm(absolutePath, { recursive: true, force: true });
    } else {
      await fs.unlink(absolutePath);
    }
    // Clean up empty parent directories
    await cleanupEmptyParents(path.dirname(absolutePath));
  } catch (error: any) {
    if (error.code === 'ENOENT') return; // Already deleted
    console.error(`Error deleting item ${absolutePath}:`, error);
    throw error;
  }
}

async function cleanupEmptyParents(directoryPath: string): Promise<void> {
  if (!directoryPath.startsWith(UPLOADS_DIR) || directoryPath === UPLOADS_DIR) {
    return; // Stop if we reach the root uploads directory or outside it
  }

  try {
    const items = await fs.readdir(directoryPath);
    if (items.length === 0) {
      await fs.rmdir(directoryPath);
      console.log(`Removed empty directory: ${directoryPath}`);
      await cleanupEmptyParents(path.dirname(directoryPath)); // Recursively check parent
    }
  } catch (error: any) {
    // Ignore ENOENT (dir already deleted) or ENOTEMPTY (dir not empty)
    if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY' && error.code !== 'EACCES' && error.code !== 'EPERM') {
      console.error(`Error during cleanup of ${directoryPath}:`, error);
    }
  }
}

export { sanitizePath as getAbsolutePath };
