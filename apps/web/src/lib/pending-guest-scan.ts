const KEY = 'geovault.pendingGuestScan';

export interface PendingGuestScan {
  id: string;
  url: string;
  totalScore?: number;
  createdAt?: string;
}

export function savePendingGuestScan(scan: PendingGuestScan) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(scan));
}

export function loadPendingGuestScan(): PendingGuestScan | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingGuestScan;
    if (!parsed.id || !parsed.url) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingGuestScan() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
}
