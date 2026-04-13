import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Whympire Honey Pot",
  description: "Local-first financial command center for ingestion, dashboarding, and decision support."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

