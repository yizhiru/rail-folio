# 已下线说明

产品不再使用、只作回溯的数据与口径。现行界面见 [product.md](product.md)，技术结构见 [architecture.md](architecture.md)。

## 里程数据

总里程统计已从产品拿掉。代码不再引用客里表。

`src/assets/mileage.json` 曾是全国铁路客运运价里程表（客里表）的线路里程，共 598 条线路、约 4800 个站点，每条线路给出各站的累计运价里程（km）。来源为 [CDK6182CHR/qETRC](https://github.com/CDK6182CHR/qETRC) 随仓库分发的 `CRPassengerMileage.pyetlib`（数据版本 20210928，由 @江教授 维护），仅做了字段精简。站名以 `*` 结尾的是线路所 / 接算点，不是客运车站。2021 年 9 月之后开通的线路不在其中。

原始文件放在 `data/`（已 gitignore，不入库）：

- `CRPassengerMileage.pyetlib`：上述 qETRC 原始线路数据库（pyETRC/qETRC 的 JSON 格式）。
- `PriceCpp-adj.txt`：[CDK6182CHR/PriceCpp](https://github.com/CDK6182CHR/PriceCpp) 的客里表邻接表，格式为 `线名 起点 终点 区间里程`，版本更早，仅作对照。
