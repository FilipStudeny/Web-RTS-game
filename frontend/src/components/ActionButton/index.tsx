import type { ReactNode, CSSProperties } from "react";

interface ActionButtonProps {
	onClick: ()=> void,
	children: ReactNode,
	icon?: ReactNode,
	disabled?: boolean,
	className?: string,
	style?: CSSProperties,
}

export default function ActionButton({
	onClick,
	children,
	icon,
	disabled = false,
	className = "",
	style,
}: ActionButtonProps) {
	return (
		<button
			onClick={onClick}
			disabled={disabled}
			style={style}
			className={`flex items-center gap-2 px-4 py-2 rounded shadow text-sm uppercase disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
		>
			{icon}
			{children}
		</button>
	);
}
