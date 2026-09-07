export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar Placeholder */}
      <aside className="w-64 bg-gray-900 text-white p-4">Sidebar</aside>
      <main className="flex-1 bg-gray-50 p-8">{children}</main>
    </div>
  );
}
