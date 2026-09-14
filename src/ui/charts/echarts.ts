import * as echarts from "echarts/core";
import { BarChart, LinesChart, PieChart, ScatterChart } from "echarts/charts";
import { GeoComponent, GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  PieChart,
  LinesChart,
  ScatterChart,
  GeoComponent,
  GridComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export { echarts };
export type { EChartsType } from "echarts/core";
export type { EChartsOption, GeoComponentOption, SeriesOption } from "echarts";
