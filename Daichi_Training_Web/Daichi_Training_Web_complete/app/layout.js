import "./style.css";

export const metadata = {
  title: "Daichi Training",
  description: "スマホ用トレーニング入力",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Daichi Training",
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
