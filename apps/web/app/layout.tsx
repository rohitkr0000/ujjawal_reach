import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { LangProvider } from '../lib/i18n';
import { ConsentBanner, Footer, Header, TopBar } from '../components/Chrome';

const font = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Ujjwal Reach Welfare Portal - Scheme Eligibility',
  description:
    'Check which government welfare schemes you and your family may qualify for in Delhi and Madhya Pradesh, with direct links to the official portals.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={font.variable}>
      <body className="flex min-h-screen flex-col font-sans text-slate-800 antialiased selection:bg-orange-500 selection:text-white">
        <LangProvider>
          <TopBar />
          <Header />
          <div className="flex-1">{children}</div>
          <Footer />
          <ConsentBanner />
        </LangProvider>
      </body>
    </html>
  );
}
