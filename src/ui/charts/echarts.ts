import * as echarts from "echarts/core";
import { BarChart, LinesChart, ScatterChart } from "echarts/charts";
import { GeoComponent, GridComponent, TooltipComponent } from "echarts/components";
import { LabelLayout } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  LinesChart,
  ScatterChart,
  GeoComponent,
  GridComponent,
  TooltipComponent,
  CanvasRenderer,
  LabelLayout,
]);

export { echarts };
export type { EChartsType } from "echarts/core";
export type { EChartsOption, GeoComponentOption, SeriesOption } from "echarts";
