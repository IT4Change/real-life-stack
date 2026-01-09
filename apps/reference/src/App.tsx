import { Routes, Route } from 'react-router-dom'

function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Real Life Stack
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Reference App - Coming Soon
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="https://github.com/IT4Change/real-life-stack"
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  )
}
