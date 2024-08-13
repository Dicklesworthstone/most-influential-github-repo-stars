import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import 'antd/dist/reset.css';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Influential Stars: Who Starred Your Repo?",
  description: "See who has starred your GitHub repo and what they're up to.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
