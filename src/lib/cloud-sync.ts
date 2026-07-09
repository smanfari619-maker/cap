/**
 * cloud-sync.ts
 * Phase 4.1 — Project Cloud Backup & Sync utilities
 *
 * Strategy: Offline-first. We serialize the Project JSON locally and offer
 * one-click download as a `.jlycut` (renamed .json) backup file. The
 * `shareProjectLink` helper exports the video then encodes the project JSON
 * as a `data:` URL in a shareable anchor tag (for Phase 4.2).
 *
 * When a cloud backend (Cloudflare Worker / Supabase) is configured via
 * VITE_CLOUD_ENDPOINT env var, uploads are sent there automatically.
 */

import type { Project } from './db';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface CloudSyncResult {
  success: boolean;
  url?: string;
  error?: string;
}

export interface CloudProjectMeta {
  id: string;
  title: string;
  updatedAt: string;
  width: number;
  height: number;
}

// ─────────────────────────────────────────────
// Local JSON Backup (no network needed)
// ─────────────────────────────────────────────

/**
 * Triggers a browser download of the project as a `.jlycut` backup file.
 * The file is a plain JSON blob — can be dragged back into the Dashboard
 * to restore the project.
 */
export function downloadProjectBackup(project: Project): void {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.title.replace(/[^a-z0-9]/gi, '_')}.jlycut`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Copies the compact project JSON to the clipboard.
 */
export async function copyProjectJson(project: Project): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(project));
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// Cloud Upload (optional — needs VITE_CLOUD_ENDPOINT)
// ─────────────────────────────────────────────

const CLOUD_ENDPOINT = import.meta.env.VITE_CLOUD_ENDPOINT as string | undefined;

export async function uploadProjectToCloud(project: Project): Promise<CloudSyncResult> {
  if (!CLOUD_ENDPOINT) {
    return { success: false, error: 'No cloud endpoint configured. Set VITE_CLOUD_ENDPOINT to enable.' };
  }
  try {
    const res = await fetch(`${CLOUD_ENDPOINT}/projects/${project.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, url: data.url };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function listCloudProjects(): Promise<CloudProjectMeta[]> {
  if (!CLOUD_ENDPOINT) return [];
  try {
    const res = await fetch(`${CLOUD_ENDPOINT}/projects`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function downloadProjectFromCloud(id: string): Promise<Project | null> {
  if (!CLOUD_ENDPOINT) return null;
  try {
    const res = await fetch(`${CLOUD_ENDPOINT}/projects/${id}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Share Link (Phase 4.2)
// ─────────────────────────────────────────────

/**
 * Generates a shareable data-URL anchor that encodes the project JSON.
 * Since we don't have a real hosting backend in Phase 4, this creates a
 * self-contained downloadable link that the recipient can import back.
 *
 * When VITE_CLOUD_ENDPOINT is set, the project JSON is uploaded and the
 * resulting public URL is returned instead.
 */
export async function generateShareLink(project: Project): Promise<string> {
  if (CLOUD_ENDPOINT) {
    const result = await uploadProjectToCloud(project);
    if (result.success && result.url) {
      return result.url;
    }
  }
  // Fallback: encode as compact URL-safe base64 share token
  const json = JSON.stringify(project);
  const encoded = btoa(unescape(encodeURIComponent(json)));
  // Return a data URI that browsers can open as a .jlycut file
  return `data:application/json;base64,${encoded}`;
}

// ─────────────────────────────────────────────
// Auto-sync debounce
// ─────────────────────────────────────────────

let _syncTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounce-syncs the project to the cloud every 30 seconds.
 * Call this inside `updateTracks` when a cloud endpoint is configured.
 */
export function scheduleDebouncedSync(project: Project, delayMs = 30_000): void {
  if (!CLOUD_ENDPOINT) return;
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    uploadProjectToCloud(project).catch(() => {
      // Silent fail — sync is best-effort
    });
  }, delayMs);
}
