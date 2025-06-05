// src/features/UnitInfoPanel.tsx
import { Panel } from "@/components/Panel";

export type Unit = {
	id: string,
	name: string,
	health: number,
	accuracy: number,
	sightRange: number,
	movementSpeed: number,
	position: [number, number],
	type: string,
	side: "friendly" | "enemy",
};

type UnitInfoPanelProps = {
	unit: Unit,
	onClose: ()=> void,
};

export function UnitInfoPanel({ unit, onClose }: UnitInfoPanelProps) {
	return (
		<Panel title="Unit Info" className="absolute top-4 left-4 w-64" onClose={onClose}>
			<div className="flex flex-col items-center space-y-2">
				<img
					src={`/images/units/${unit.type}.png`}
					alt={unit.type}
					className="w-12 h-12 object-contain rounded-full border border-gray-600"
				/>
				<table className="w-full text-xs text-left">
					<tbody>
						<tr>
							<td className="font-medium pr-1">Name:</td>
							<td>{unit.name}</td>
						</tr>
						<tr>
							<td className="font-medium pr-1">Health:</td>
							<td>{unit.health}</td>
						</tr>
						<tr>
							<td className="font-medium pr-1">Accuracy:</td>
							<td>{unit.accuracy}%</td>
						</tr>
						<tr>
							<td className="font-medium pr-1">Sight:</td>
							<td>{unit.sightRange} m</td>
						</tr>
						<tr>
							<td className="font-medium pr-1">Speed:</td>
							<td>{unit.movementSpeed} km/h</td>
						</tr>
					</tbody>
				</table>
			</div>
		</Panel>
	);
}
