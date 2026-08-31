import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { PlaceholderBanner, Provenance } from "@/components/Chrome";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { loadArtifacts, placeholderSources, provenance } from "@/lib/load";

import "./globals.css";
import "@xyflow/react/dist/style.css";

/**
 * The two faces Attio ships, minus the licensed serif.
 *
 * Inter is loaded as a variable font so the `opsz` axis is available: the .display class
 * in globals.css sets it to 32, which is Inter's Display cut. That is a second optical
 * size for free -- Attio pays for it as a separate family (interDisplay in their build).
 *
 * Self-hosted by next/font, so the site makes no request to Google at run time and
 * renders in these faces on a judge's machine rather than falling through to Segoe UI.
 */
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: {
    default: "Adversarial Payments Framework",
    template: "%s · Adversarial Payments",
  },
  description:
    "A closed-loop red/blue framework for payment security, measured on two attack surfaces.",
};

/**
 * The banner and the colophon live here rather than on each page.
 *
 * Both are claims about the whole site: which artifacts are still fixtures, and which run
 * produced every number on every route. A judge who deep-links to /agent must see the
 * placeholder warning as surely as one who starts at the overview.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const artifacts = await loadArtifacts();
  const { shas, newest } = provenance(artifacts);

  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <PlaceholderBanner sources={placeholderSources(artifacts)} />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter>
          <Provenance shas={shas} newest={newest} />
        </SiteFooter>
      </body>
    </html>
  );
}
