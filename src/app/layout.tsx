import { PwaRegistration } from "@/components/offline-workspace";
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "LMS Nurul Falah",
  description: "Ruang pembelajaran digital madrasah.",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
