import {FEATURES} from "@/lib/flags";
import "./mobile-usability.css";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./comfort-header.css";
import "./manual-photo-rating.css";
import "./member-manager.css";
import "./local-auth.css";

export const viewport:Viewport={width:"device-width",initialScale:1,viewportFit:"cover"};

export const metadata: Metadata = {
  title: "课外锻炼 · 成绩登记",
  description: "按小组上传活动照片、登记成绩与导出 Excel。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/arts-university-logo.png",
    shortcut: "/arts-university-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={FEATURES.mobileUsability?"mobile-usability":undefined}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
