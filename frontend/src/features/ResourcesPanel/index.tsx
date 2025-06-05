import { Hammer, Package, Users } from "lucide-react";

import { Panel } from "@/components/Panel";

type ResourcesPanelProps = {
	unitCount: number,
	unitsInBuild: number,
	supplies: number,
};

export function ResourcesPanel({ unitCount, unitsInBuild, supplies }: ResourcesPanelProps) {
	return (
		<Panel title="Status Overview" className="absolute bottom-4 left-4 w-64">
			<div className="space-y-2">
				<p className="flex items-center gap-1 text-xs">
					<Users size={14} className="text-emerald-400" />
					<span className="font-medium">Units:</span> {unitCount}
				</p>
				<p className="flex items-center gap-1 text-xs">
					<Hammer size={14} className="text-orange-400" />
					<span className="font-medium">Building:</span> {unitsInBuild}
				</p>
				<p className="flex items-center gap-1 text-xs">
					<Package size={14} className="text-sky-400" />
					<span className="font-medium">Supplies:</span> {supplies}
				</p>
			</div>
		</Panel>
	);
}
