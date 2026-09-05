"use client";

import { usePathname } from "next/navigation";

/**
 * A quarter-second fade on the main content at every route change.
 *
 * Keyed on the pathname, so React tears the old subtree down and the new one mounts with
 * the `page-enter` animation running from its first frame. That also means every `Reveal`
 * on the new page re-registers its observer, which is why a section above the fold on
 * /results looks the same arriving by link as it does on a cold load.
 */
export function PageFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
