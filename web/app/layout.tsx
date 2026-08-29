import type { Metadata } from "next";

import "./globals.css";
import "@xyflow/react/dist/style.css";

export const metadata: Metadata = {
  title: "Adversarial Payments Framework",
  description:
    "A closed-loop red/blue framework for payment security, measured on two attack surfaces.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
