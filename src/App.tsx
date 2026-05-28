function App() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center space-y-4">
        {/* Logo Mark */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <span className="text-2xl font-bold text-zinc-950">₹</span>
        </div>

        {/* Title */}
        <h1 className="text-4xl font-semibold tracking-tight text-white">
          Dhanrakshak
        </h1>

        {/* Tagline */}
        <p className="text-zinc-400 text-lg">
          Your personal wealth guardian
        </p>

        {/* Status pill */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 border border-zinc-800">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-sm text-zinc-300">System ready</span>
        </div>
      </div>
    </div>
  )
}

export default App
