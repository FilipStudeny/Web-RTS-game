import { useQuery } from "@tanstack/react-query";

import { AreaList } from "@/actions/proto/area_types";

export function useGetEditorAreaTypes() {
	return useQuery({
		queryKey: ["area-types"],
		queryFn: async () => {
			const res = await fetch("http://localhost:9999/api/area-types.pb");
			if (!res.ok) throw new Error("Failed to fetch unit types");

			const arrayBuffer = await res.arrayBuffer();
			const bytes = new Uint8Array(arrayBuffer);
			const decoded = AreaList.decode(bytes);

			return decoded.areas;
		},
	});
}
