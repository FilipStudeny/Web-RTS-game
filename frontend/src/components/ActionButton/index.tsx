import type { ReactNode } from "react";

interface ActionButtonProps {
	onClick: ()=> void,
	children: ReactNode,
	icon?: ReactNode,
	disabled?: boolean,
	className?: string,
}

export default function ActionButton({
	onClick,
	children,
	icon,
	disabled = false,
	className = "",
}: ActionButtonProps) {
	return (
		<button
			onClick={onClick}
			disabled={disabled}
			className={`flex items-center gap-2 px-4 py-2 rounded shadow text-sm uppercase disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
		>
			{icon}
			{children}
		</button>
	);
}
