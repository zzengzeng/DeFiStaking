import type { Metadata, Viewport } from "next";

import { Providers } from "./providers";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://dualpool.local"),
  applicationName: "DualPool",
  title: {
    default: "DualPool Staking",
    template: "%s · DualPool",
  },
  description: "DualPool 平行双池质押 DApp — 灵活池与锁仓池，链上赚取 TokenB 奖励",
  keywords: ["DualPool", "staking", "DeFi", "TokenA", "TokenB", "timelock", "governance"],
  authors: [{ name: "DualPool" }],
  creator: "DualPool",
  publisher: "DualPool",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "DualPool Staking",
    description: "平行双池质押协议 — 灵活池与锁仓池，链上赚取 TokenB 奖励",
    type: "website",
    siteName: "DualPool",
    locale: "zh_CN",
  },
  twitter: {
    card: "summary",
    title: "DualPool Staking",
    description: "平行双池质押协议 — 灵活池与锁仓池，链上赚取 TokenB 奖励",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="flex min-h-full min-w-0 flex-col overflow-x-hidden font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
