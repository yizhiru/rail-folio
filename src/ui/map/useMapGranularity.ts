import { useCallback, useState } from "react";
import { parseMapGranularity, type MapGranularity } from "../../map/buildLayers";

const STORAGE_KEY = "rail-folio.mapGranularity";

function load(): MapGranularity {
  try {
    return parseMapGranularity(localStorage.getItem(STORAGE_KEY));
  } catch {
    return parseMapGranularity(null);
  }
}

/** 地图粒度（城市 / 车站），默认城市，选择记在本机。 */
export function useMapGranularity(): [MapGranularity, (next: MapGranularity) => void] {
  const [granularity, setGranularity] = useState<MapGranularity>(load);
  const update = useCallback((next: MapGranularity) => {
    setGranularity(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 存不下就只在本次会话生效
    }
  }, []);
  return [granularity, update];
}
