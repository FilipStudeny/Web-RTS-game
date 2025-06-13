
import type { Area } from "@/actions/proto/area_types";

import { Panel } from "@/components/Panel";

type AreaInfoPanelProps = {
	area: Area,
	onClose: ()=> void,
};

export function AreaInfoPanel({ area, onClose }: AreaInfoPanelProps) {
	return (
		<Panel title="Area Info" className="absolute top-4 left-4 w-72" onClose={onClose}>
			<div className="flex flex-col space-y-2">
				<div className="flex items-center justify-between">
					<span className="font-semibold">Name:</span>
					<span className="text-sm">{area.name}</span>
				</div>

				<div className="text-sm italic text-slate-300">{area.description}</div>

				<div className="flex items-center justify-between">
					<span className="font-semibold">Speed Modifier:</span>
					<span>{area.movementSpeedModifier}x</span>
				</div>
				<div className="flex items-center justify-between">
					<span className="font-semibold">Accuracy Modifier:</span>
					<span>{area.accuracyModifier}x</span>
				</div>
				<div className="flex items-center justify-between">
					<span className="font-semibold">Enemy Miss Chance:</span>
					<span>{(area.enemyMissChance * 100).toFixed(0)}%</span>
				</div>

				<div className="h-2 rounded bg-slate-700 mt-2 overflow-hidden">
					<div
						className="h-full"
						style={{
							width: "100%",
							backgroundColor: area.color,
						}}
					></div>
				</div>
			</div>
		</Panel>
	);
}
