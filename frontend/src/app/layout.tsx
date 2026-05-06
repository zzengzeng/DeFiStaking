import type { Metadata, Viewport } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import dynamic from "next/dynamic";
import "./globals.css";

const ClientApp = dynamic(
  () => import("@/components/ClientApp").then((mod) => mod.ClientApp),
  { ssr: false }
);

const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Roboto_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dual Pool Staking Frontend",
  description: "Production-ready frontend for DualPoolStaking protocol",
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
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full min-w-0 flex-col overflow-x-hidden">
        <ClientApp>{children}</ClientApp>
      </body>
    </html>
  );
}
