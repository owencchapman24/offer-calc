import { Component, type ReactNode, useState } from "react";
import { type KeyValueStore, savedFile, setAside, STORAGE_KEY } from "./session";
import { localToday } from "./text";

// When the page can't be shown (anything the app throws while drawing it: a saved session it can't read, a bug), this screen
// replaces it, so there's always a way back: download what's saved, then start again with the samples, or reload. Starting again
// sets what was saved aside (BACKUP_KEY), and the Data page offers it as a download, so nothing entered is lost either way.

function storage(): KeyValueStore | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function stored(): string | null {
  try {
    return storage()?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Downloads text as a file. */
export function downloadText(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: fileName.endsWith(".json") ? "application/json" : "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Downloads what this browser has saved for the app, as an export when it can be one (session.ts, savedFile). */
export function downloadSaved(saved: string): string {
  const f = savedFile(saved, localToday());
  downloadText(f.fileName, f.text);
  return f.fileName;
}

export class Recovery extends Component<{ children: ReactNode }, { error: Error | null; downloaded: string | null }> {
  override state: { error: Error | null; downloaded: string | null } = { error: null, downloaded: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override render() {
    const { error, downloaded } = this.state;
    if (!error) return this.props.children;
    const saved = stored();
    const startAgain = () => {
      const store = storage();
      if (saved) setAside(store, saved, "startedAgain", localToday());
      try {
        store?.removeItem?.(STORAGE_KEY);
      } catch { /* blocked: reloading starts with the samples anyway */ }
      window.location.hash = "#/";
      window.location.reload();
    };
    return (
      <div className="page">
        <main className="recovery" aria-labelledby="recovery-title">
          <h1 id="recovery-title">Something went wrong</h1>
          <p>Offer Calc couldn't show this page.{saved ? " What you've entered is still saved in this browser." : ""}</p>
          {saved && (
            <>
              <p className="data-actions">
                <button type="button" className="got-it data-button" onClick={() => this.setState({ downloaded: downloadSaved(saved) })}>
                  Download what's saved
                </button>
              </p>
              {downloaded && <p className="note" role="status">Saved {downloaded}. The Data page can import it.</p>}
              <p>
                Then start again with the sample offers. What was saved is set aside, not deleted: the Data page offers it as a download
                until you delete all data.
              </p>
            </>
          )}
          <p className="data-actions">
            <button type="button" className="got-it data-button" onClick={startAgain}>Start again with the samples</button>
            <button type="button" className="link" onClick={() => window.location.reload()}>Reload the page</button>
          </p>
          <p className="method-note">What went wrong: {error.message || error.name}</p>
        </main>
      </div>
    );
  }
}

/**
 * What's saved is a newer version's (a rollback, or a tab still on an older build): this page shows the samples meanwhile and
 * never saves over it (saveSession). Says so, at the top of every page, with a way to keep a copy.
 */
export function NewerSave({ schema }: { schema: number | null }) {
  const [done, setDone] = useState<string | null>(null);
  const saved = stored();
  return (
    <div className="stale newer-save" role="region" aria-labelledby="newer-save-head">
      <p className="stale-head" id="newer-save-head">Your saved offers are from a newer version of Offer Calc</p>
      <p>
        This page can't read them{schema !== null ? ` (they're saved as schema ${schema}; it reads 1 to 3)` : ""}, so it shows the sample
        offers, and it won't save over yours. Reload to get the newer version.
      </p>
      <p className="data-actions">
        {saved && <button type="button" className="got-it data-button" onClick={() => setDone(downloadSaved(saved))}>Download your saved offers</button>}
        <button type="button" className="link" onClick={() => window.location.reload()}>Reload</button>
      </p>
      {done && <p className="note" role="status">Saved {done}.</p>}
    </div>
  );
}
