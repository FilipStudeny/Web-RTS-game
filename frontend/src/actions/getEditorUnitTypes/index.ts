import { useQuery } from "@tanstack/react-query";

import { UnitTypeList } from "@/actions/proto/unit_Types";

export function useGetEditorUnitTypes() {
	return useQuery({
		queryKey: ["unit-types"],
		queryFn: async () => {
			const res = await fetch("http://localhost:9999/api/unit-types.pb");
			if (!res.ok) throw new Error("Failed to fetch unit types");

			const arrayBuffer = await res.arrayBuffer();
			const bytes = new Uint8Array(arrayBuffer);
			const decoded = UnitTypeList.decode(bytes);

			return decoded.unitTypes;
		},
	});
}
