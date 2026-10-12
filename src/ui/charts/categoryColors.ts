import type { TrainCategory } from "../../domain/types";

/** 车型饼图用色；地图线路不按车型上色。 */
export const CATEGORY_COLORS: Record<TrainCategory, string> = {
  G: "#7dffb3",
  D: "#7ad4ff",
  C: "#c4b5fd",
  Z: "#fb7185",
  P: "#e8c48a",
};
