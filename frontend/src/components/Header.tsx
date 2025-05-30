import { Link } from "@tanstack/react-router";

// Header.tsx
export default function Header() {
	const userId = "User-452A";

	return (
		<header className="h-16 min-h-16 px-4 flex items-center justify-between bg-slate-900 text-slate-100 shadow-md">
			<nav className="flex gap-4 items-center">
				<Link
					to="/"
					className="px-3 py-1 rounded hover:bg-slate-700 transition font-semibold"
				>
					Home
				</Link>
				<Link
					to="/editor"
					className="px-3 py-1 rounded hover:bg-slate-700 transition font-semibold"
				>
					Editor
				</Link>
			</nav>

			<div className="text-sm font-mono bg-slate-800 px-3 py-1 rounded text-slate-300 border border-slate-700">
				ID: {userId}
			</div>
		</header>
	);
}
