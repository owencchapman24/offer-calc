import { useEffect, useState, useSyncExternalStore } from "react";

// The layout's widths (docs/ui-design.md §3.2), as styles.css has them: phones under 760 px, tablets 760-1179 px.

export const PHONE = "(max-width: 759px)";
export const TABLET = "(min-width: 760px) and (max-width: 1179px)";

/** Whether a media query matches, re-rendering when that changes. False where there's no window (static renders, tests). */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (changed) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", changed);
      return () => m.removeEventListener("change", changed);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * WCAG 2.4.11: a sticky verdict bar never hides the focused element. The page's scroll padding (styles.css) keeps the
 * browser's own scrolling clear of the bar; this catches what that misses (focus moved by script, or a browser that
 * scrolls a focused element only just into view): once focus has moved, if a bar covers the element, the page scrolls
 * it clear.
 */
export function useFocusClearOfBars() {
  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      requestAnimationFrame(() => {
        for (const bar of document.querySelectorAll<HTMLElement>(".verdict-bar:not(.is-hidden)")) {
          if (bar.contains(t)) continue;
          const b = bar.getBoundingClientRect();
          const r = t.getBoundingClientRect();
          if (r.bottom <= b.top || r.top >= b.bottom) continue;
          window.scrollBy(0, bar.dataset.bar === "bottom" ? r.bottom - b.top + 8 : -(b.bottom - r.top + 8));
        }
      });
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, []);
}

/** What raises a phone's keyboard (or its picker) when it has focus. */
const TYPING = 'input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="file"], [type="range"]), select, textarea, [contenteditable="true"]';

/**
 * Whether a phone's on-screen keyboard is (likely) up: a field you type in has focus on a touch screen, or the visual
 * viewport has shrunk well below the layout viewport at its own scale (pinch-zoom shrinks it too, by scaling: that isn't
 * the keyboard). The sticky verdict bar hides meanwhile (WCAG 2.4.11).
 */
export function useKeyboardUp(): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const vv = window.visualViewport;
    const check = () => {
      const typing = coarse.matches && !!document.activeElement?.matches?.(TYPING);
      const shrunk = !!vv && window.innerHeight - vv.height * vv.scale > 150;
      setUp(typing || shrunk);
    };
    // On focusout the next element hasn't taken focus yet: check once it has.
    const later = () => setTimeout(check, 0);
    // A viewport change (the keyboard, a rotation) can report the window's and the visual viewport's sizes a moment apart:
    // check again once they agree, so a passing difference never leaves the bar hidden.
    const resized = () => {
      check();
      setTimeout(check, 150);
    };
    check();
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", later);
    vv?.addEventListener("resize", resized);
    window.addEventListener("resize", resized);
    return () => {
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", later);
      vv?.removeEventListener("resize", resized);
      window.removeEventListener("resize", resized);
    };
  }, []);
  return up;
}
