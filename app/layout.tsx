import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import AppHeader from "@/components/AppHeader";
import { SheetProvider } from "@/components/ui/Sheet";
import { loadSnapshot } from "@/lib/snapshot";
import { alertInputOf } from "@/lib/viewData";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dreamstockifier",
  description: "What changed in your portfolio today, and why it matters.",
  applicationName: "Dreamstockifier",
  appleWebApp: {
    capable: true,
    title: "Dreamstockifier",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const snap = await loadSnapshot();
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body className="min-h-dvh md:bg-fill">
        <SheetProvider>
        <div className="mx-auto min-h-dvh w-full max-w-[420px] bg-bg px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] md:border-x md:border-divider">
          <AppHeader alertInput={snap.status === "ok" ? alertInputOf(snap) : null} />
          {children}
        </div>
        </SheetProvider>
      </body>
    </html>
  );
}
