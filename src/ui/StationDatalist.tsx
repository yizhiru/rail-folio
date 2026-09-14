import type { Station } from "../domain/types";

export const STATION_DATALIST_ID = "station-list";

/** 全局挂一份即可，录入页 / 导入页 / 编辑弹窗的车站输入框共用。 */
export function StationDatalist({ stations }: { stations: Station[] }) {
  return (
    <datalist id={STATION_DATALIST_ID}>
      {stations.map((station) => (
        <option key={station.id} value={station.name} />
      ))}
    </datalist>
  );
}
