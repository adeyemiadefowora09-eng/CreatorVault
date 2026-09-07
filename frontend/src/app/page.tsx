export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-4">CreatorVault</h1>
      <p className="text-lg text-gray-600 mb-8">Secure payment and deal-management for African creators.</p>
      <div className="flex gap-4">
        <a href="/login" className="px-6 py-2 bg-black text-white rounded hover:bg-gray-800">Log In</a>
        <a href="/register" className="px-6 py-2 border border-black rounded hover:bg-gray-100">Sign Up</a>
      </div>
    </main>
  );
}
