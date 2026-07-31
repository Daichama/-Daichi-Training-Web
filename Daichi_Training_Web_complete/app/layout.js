import "./style.css";

export const metadata = {
  title: "D-log",
  description: "スマホ用トレーニング入力",
  manifest: "/manifest.webmanifest?v=612",
  icons: {
    icon: [
      { url: "/icon-v612-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-v612-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icon-v612-180.png",
  },
  appleWebApp: {
    capable: true,
    title: "D-log",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0c10",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
