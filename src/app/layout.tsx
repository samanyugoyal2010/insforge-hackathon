import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VirtualStage — iPhone Virtual Tours for Real Estate",
  description: "Walk through any property with your iPhone and create a shareable 360° virtual tour in minutes.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} min-h-dvh antialiased`}>
      <body className={`${outfit.className} min-h-dvh antialiased bg-black text-white`}>
        {children}
      </body>
    </html>
  );
}
