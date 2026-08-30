import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";

import "./globals.css";
import "@xyflow/react/dist/style.css";

/**
 * Fonts are loaded, not merely named.
 *
 * The previous stylesheet declared `--font-sans: "Inter", ...` and never loaded Inter --
 * no next/font, no @font-face, no <link>. Every judge fell through to system-ui, which on
 * a Windows laptop is Segoe UI. next/font self-hosts the files into the static export, so
 * the page renders in the faces it was designed in and makes no request to Google at run
 * time.
 */
const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-newsreader",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Adversarial Payments Framework",
  description:
    "A closed-loop red/blue framework for payment security, measured on two attack surfaces.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
