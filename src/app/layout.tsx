import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "像素都市 PIXEL CITY · 复古等距建造沙盒",
  description:
    "纯代码程序化建模 + 2:1 等距正交离线预渲染 + DOS/PC98 有限色板与有序抖动的城市建造沙盒。铺路、盖楼、造公园——向 SimCity 与 PC-98 年代致敬。",
  keywords: ["像素", "等距", "城市建造", "复古", "PC98", "SimCity", "沙盒"],
  icons: {
    icon: "/logo.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased" style={{ margin: 0, overflow: "hidden" }}>
        {children}
      </body>
    </html>
  );
}
