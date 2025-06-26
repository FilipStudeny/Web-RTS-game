import { useQuery } from "@tanstack/react-query";

import { UnitTypeList } from "../proto/unit_types";

import { axiosInstance } from "@/integrations/axios/axiosInstance";

export function useGetEditorUnitTypes() {
	return useQuery({
		queryKey: ["unit-types"],
		queryFn: async () => {
			const res = await axiosInstance.get("/unit-types.pb");
			const bytes = new Uint8Array(res.data);
			const decoded = UnitTypeList.decode(bytes);

			return decoded.unitTypes;
		},
	});
}
