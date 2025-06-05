export function LoadingPageComponent() {
	return (
		<div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
			<div className="flex flex-col items-center space-y-4">
				<div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white"></div>
				<p className="text-white text-lg font-semibold">Establishing connection...</p>
			</div>
		</div>
	);
}
