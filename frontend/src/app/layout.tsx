import type { Metadata } from "next";
import "./globals.css";
import { Geist, Fraunces } from "next/font/google";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-heading',
});

export const metadata: Metadata = {
  title: "CreatorVault",
  description: "Secure payment and deal-management for African creators",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable, fraunces.variable)}>
      <head>
        {/* Set the `.dark` class before paint so switching themes doesn't
            flash the wrong one on first load. Mirrors the logic in
            src/stores/themeStore.ts — kept in sync manually since this
            runs before any JS bundle (including zustand) is loaded. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("creatorvault-theme");var p=s?JSON.parse(s).state.preference:"system";var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
