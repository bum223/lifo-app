// app/layout.tsx
import './globals.css'; // 전역 스타일시트 임포트

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (<html lang="ko">
      <body>{children}</body>
    </html>);
}