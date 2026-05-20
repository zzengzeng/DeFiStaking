import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";
import "./globals.css";

const ClientApp = dynamic(
  () => import("@/components/ClientApp").then((mod) => mod.ClientApp),
  { ssr: false }
);

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
      className="h-full antialiased"
    >
      <body className="flex min-h-full min-w-0 flex-col overflow-x-hidden">
        <ClientApp>{children}</ClientApp>
      </body>
    </html>
  );
}
