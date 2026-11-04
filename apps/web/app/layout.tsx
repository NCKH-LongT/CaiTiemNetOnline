import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NETVERSE 3D — Quán net của bạn',
  description: 'Khám phá quán net 3D, chọn máy và gặp gỡ cộng đồng.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
