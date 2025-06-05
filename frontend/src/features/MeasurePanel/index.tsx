// src/features/MeasurePanel.tsx
import { Ruler } from "lucide-react";
import VectorSource from "ol/source/Vector";

import { Panel } from "@/components/Panel";

type MeasurePanelProps = {
	measureActive: boolean,
	measuredDistance: number | null,
	sourceRef: React.RefObject<VectorSource>,
	onToggleMeasure: ()=> void,
	onClear: ()=> void,
	show: boolean,
	setShow: (val: boolean)=> void,
};

export function MeasurePanel({
	measureActive,
	measuredDistance,
	sourceRef,
	onToggleMeasure,
	onClear,
	show,
	setShow,
}: MeasurePanelProps) {
	if (!show) {
		return (
			<button
				onClick={() => setShow(true)}
				className="
          absolute top-4 right-4
          w-8 h-8
          bg-gray-800/50 hover:bg-gray-800/75
          rounded-full
          flex items-center justify-center
          text-gray-200 hover:text-white
          transition
        "
				title="Open measurement tool"
			>
				<Ruler size={18} />
			</button>
		);
	}

	return (
		<Panel title="Measure" className="absolute top-4 right-4 w-48" onClose={() => setShow(false)}>
			<div className="flex flex-col items-center space-y-2">
				<button
					onClick={() => {
						if (measureActive) {
							sourceRef.current?.clear();
							onClear();
						}

						onToggleMeasure();
					}}
					className={`
            flex items-center justify-center gap-1
            w-10 h-10
            ${measureActive ? "bg-red-500 hover:bg-red-600" : "bg-amber-400 hover:bg-amber-500"}
            text-gray-900
            rounded-full shadow-sm
            transition-colors duration-200
          `}
					title={measureActive ? "Cancel measurement" : "Measure distance"}
				>
					<Ruler size={18} />
				</button>

				{measuredDistance !== null && (
					<div className="w-full text-center">
						<span className="block text-xs font-medium">Last:</span>
						<span className="block text-sm font-semibold">
							{measuredDistance >= 1000
								? (measuredDistance / 1000).toFixed(2) + " km"
								: Math.round(measuredDistance) + " m"}
						</span>
						<button
							onClick={() => {
								sourceRef.current?.clear();
								onClear();
							}}
							className="mt-1 text-[10px] text-red-400 hover:text-red-500 transition"
						>
							Clear
						</button>
					</div>
				)}
			</div>
		</Panel>
	);
}
