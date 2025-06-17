import { useQuery } from "@tanstack/react-query";

import { AreaList } from "@/actions/proto/area_types";
import { axiosInstance } from "@/integrations/axios/axiosInstance";

export function useGetEditorAreaTypes() {
	return useQuery({
		queryKey: ["area-types"],
		queryFn: async () => {
			const res = await axiosInstance.get("/area-types.pb");
			const bytes = new Uint8Array(res.data);
			const decoded = AreaList.decode(bytes);

			return decoded.areas;
		},
	});
}
