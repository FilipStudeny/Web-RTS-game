import { X } from "lucide-react";

type PanelProps = {
	title?: string,
	children: React.ReactNode,
	className?: string,
	onClose?: ()=> void,
	noClose?: boolean,
	noTransition?: boolean,
};

export function Panel({
	title,
	children,
	className = "",
	onClose,
	noClose,
	noTransition,
}: PanelProps) {
	return (
		<div
			className={`
        bg-gray-800/75 backdrop-blur-md
        border border-gray-700
        rounded-2xl shadow-md
        p-3 space-y-2
        text-xs text-slate-200
        ${noTransition ? "" : "transition-all duration-300"}
        ${className}
      `}
		>
			{(title || (onClose && !noClose)) && (
				<div className="flex justify-between items-center mb-1">
					{title && <h2 className="text-sm font-medium text-white">{title}</h2>}
					{onClose && !noClose && (
						<button
							onClick={onClose}
							className="text-gray-400 hover:text-red-400 transition"
							aria-label="Close panel"
						>
							<X size={14} />
						</button>
					)}
				</div>
			)}
			<div className="flex-1 flex flex-col overflow-auto">
				{children}
			</div>
		</div>
	);
}
