import type { Metadata } from "next";
import { fraunces, sourceSerif, ibmPlexMono, inter } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "CrossBench",
  description: "Political disclosure tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${sourceSerif.variable} ${ibmPlexMono.variable} ${inter.variable}`}>
      <body className="bg-paper text-ink font-sans antialiased">{children}</body>
    </html>
  );
}
