import { db } from './db';

/**
 * Origin Private File System (OPFS) helper functions.
 * Storing files in OPFS is secure, fast, and does not block the main thread.
 * Files are private to this origin and can be read back as standard Blobs/Files.
 */

/**
 * Generate a collision-safe unique ID using the browser's built-in
 * crypto.randomUUID() (122-bit entropy, RFC 4122 UUID v4).
 * This replaces Math.random().toString(36) which only has ~35 bits of entropy
 * and carries a non-trivial collision risk as asset counts grow.
 */
export function genId(): string {
  return crypto.randomUUID();
}

/**
 * Save a File or Blob into OPFS at a given path.
 * Path should be structured like "projectId/assetId.mp4".
 *
 * Write is atomic: if the write fails mid-stream, the partial file is
 * removed immediately so IndexedDB never ends up pointing to corrupt data.
 */
export async function saveFileToOPFS(path: string, file: File | Blob): Promise<string> {
  const root = await navigator.storage.getDirectory();
  const parts = path.split('/');
  let currentDir = root;

  // Traverse/create folders
  for (let i = 0; i < parts.length - 1; i++) {
    currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
  }

  const fileName = parts[parts.length - 1];
  const fileHandle = await currentDir.getFileHandle(fileName, { create: true });

  // Atomic write: clean up the partial file if the write fails
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(file);
    await writable.close();
  } catch (err) {
    // Abort the writable stream then remove the incomplete file so we
    // don't leave a zero-byte or truncated entry that would silently
    // corrupt future reads.
    try { await writable.abort(); } catch { /* ignore abort errors */ }
    try { await currentDir.removeEntry(fileName); } catch { /* ignore cleanup errors */ }
    throw err; // re-throw so the caller knows the save failed
  }

  return path;
}

/**
 * Retrieve a File object from OPFS at the specified path.
 */
export async function getFileFromOPFS(path: string): Promise<File> {
  const parts = path.split('/');
  const fileName = parts[parts.length - 1];
  
  // Try to find if this asset is a linked file via File System Access API
  try {
    const assetId = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
    const asset = await db.assets.get(assetId);
    if (asset && asset.fileHandle) {
      const handle = asset.fileHandle as any;
      if ((await handle.queryPermission({ mode: 'read' })) !== 'granted') {
        // Try to request permission if needed, though this might fail if not in a user gesture.
        // It's better to try than to fail immediately.
        await handle.requestPermission({ mode: 'read' });
      }
      return await handle.getFile();
    }
  } catch (err) {
    console.warn('Error reading linked file handle, falling back to OPFS:', err);
  }

  // Fallback to standard OPFS retrieval
  const root = await navigator.storage.getDirectory();
  let currentDir = root;

  for (let i = 0; i < parts.length - 1; i++) {
    currentDir = await currentDir.getDirectoryHandle(parts[i]);
  }

  const fileHandle = await currentDir.getFileHandle(fileName);
  return await fileHandle.getFile();
}

/**
 * Get a temporary DOM URL for the OPFS file (using URL.createObjectURL).
 * Remember to call URL.revokeObjectURL on the returned string when done!
 */
export async function getFileURLFromOPFS(path: string): Promise<string> {
  const file = await getFileFromOPFS(path);
  return URL.createObjectURL(file);
}

/**
 * Delete a file from OPFS.
 */
export async function deleteFileFromOPFS(path: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const parts = path.split('/');
    let currentDir = root;

    for (let i = 0; i < parts.length - 1; i++) {
      currentDir = await currentDir.getDirectoryHandle(parts[i]);
    }

    const fileName = parts[parts.length - 1];
    await currentDir.removeEntry(fileName);
  } catch (error) {
    console.warn(`Could not delete file at ${path} from OPFS:`, error);
  }
}

/**
 * Recursively delete a directory and all its contents in OPFS.
 * Useful when deleting a project to clean up all its media assets.
 */
export async function deleteDirectoryFromOPFS(dirName: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(dirName, { recursive: true });
  } catch (error) {
    console.warn(`Could not delete directory ${dirName} from OPFS:`, error);
  }
}
