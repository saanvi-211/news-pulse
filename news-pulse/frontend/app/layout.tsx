import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "News Pulse — Topic-Clustered News Timeline",
  description: "Live news grouped into topic clusters, visualised on a timeline.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white antialiased">{children}</body>
    </html>
  );
}
