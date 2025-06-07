import { AlertTriangle } from "lucide-react";

interface LoadingPageComponentProps {
	message?: string,
	error?: boolean,
	onRetry?: ()=> void,
}

export function LoadingPageComponent({
	message = "Loading...",
	error = false,
	onRetry,
}: LoadingPageComponentProps) {
	return (
		<div className="fixed inset-0 z-50 bg-gray-900 flex items-center justify-center">
			<div className="flex flex-col items-center space-y-6 text-center px-4">
				{error ? (
					<>
						<AlertTriangle className="text-red-500 w-16 h-16" />
						<p className="text-white text-xl font-semibold">
							{message}
						</p>
						{onRetry && (
							<button
								onClick={onRetry}
								className="bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 text-white font-semibold px-6 py-2 rounded"
							>
								Retry
							</button>
						)}
					</>
				) : (
					<>
						<div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-400" />
						<p className="text-white text-xl font-semibold">
							{message}
						</p>
					</>
				)}
			</div>
		</div>
	);
}
