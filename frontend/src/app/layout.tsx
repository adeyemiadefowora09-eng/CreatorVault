import type { Metadata } from "next";

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
    <html lang="en">
      <body className="antialiased">
        {/* TODO: Add QueryClientProvider, AuthProvider, Toaster here */}
        {children}
      </body>
    </html>
  );
}
