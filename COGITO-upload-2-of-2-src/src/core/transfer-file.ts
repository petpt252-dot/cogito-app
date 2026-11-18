import { db, exportAll } from './storage';
import { download } from './csv';

// Sending the backup to another device: on phones (and browsers that support it) the system share sheet opens,
// so the file can go straight to WhatsApp, Drive, email, AirDrop…; otherwise it is downloaded.

export const LAST_EXPORT_KEY = 'lastExportAt';
export const LAST_IMPORT_KEY = 'lastImportAt';

export function backupFileName(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `cogito-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}

/** Returns 'shared', 'downloaded' or 'cancelled'. */
export async function sendBackup(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const bundle = await exportAll();
  const text = JSON.stringify(bundle);
  const name = backupFileName();
  let result: 'shared' | 'downloaded' | 'cancelled' = 'downloaded';
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    const file = new File([text], name, { type: 'application/json' });
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: 'COGITO backup' });
      result = 'shared';
    } else download(name, text, 'application/json');
  } catch (e) {
    // the user closed the share sheet: nothing was sent
    if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
    download(name, text, 'application/json');
  }
  await db.setKv(LAST_EXPORT_KEY, Date.now());
  return result;
}

/** Whole days since a timestamp (null if never). */
export const daysSince = (ts: number | undefined, now = Date.now()) => (ts ? Math.floor((now - ts) / 86_400_000) : null);
