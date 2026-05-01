import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Furni AI MVP',
  description: '2D room image + SAM2/depth layers + GLB sofa placement MVP'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
