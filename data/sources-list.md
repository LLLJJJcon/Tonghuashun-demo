# 数据来源清单

> 由 `data/materials.json`、`public/data/sources.json`、`public/data/documents.json` 整理生成（主 agent，2026-10-13）。
> 材料通过公开网页获取（巨潮资讯网、深交所互动易、交易所与媒体网站），**未使用 iFinD MCP**（本次环境未接入）。抓取时间为模拟值，规则见 README 6.2 节。

| 材料 | 案例 | 来源（等级） | 标题 | 披露时间 | 时间依据 | 获取渠道 | 原文存档 | 链接 |
|---|---|---|---|---|---|---|---|---|
| doc_A02 | A | 工商时报（B） | 中國稀土集團擬收購盛和資源 間接握有美企股份 | 2026-09-18T22:53:00+08:00 | 工商时报页面显示 2026.09.18 22:53（台北时间 UTC+8，与北京时间相同） | media_site | `data/raw/media/ctee.txt` | https://www.ctee.com.tw/news/20260918701719-430801 |
| doc_A03 | A | 自主汽车网（腾讯新闻号）（D） | 中国稀土集团洽购盛和资源 | 2026-09-19T02:22:00+08:00 | 腾讯新闻页面显示「2026-09-19 02:22发布于北京」 | media_site | `data/raw/media/qq_zizhu.txt` | https://news.qq.com/rain/a/20260919A01D8U00 |
| doc_A04 | A | 上海证券交易所（上市公司公告）（S） | 盛和资源控股股份有限公司关于媒体报道的澄清公告（临2026-043） | 2026-09-20T15:52:40+08:00 | 上交所公告查询接口 ADDDATE=2026-09-20 15:52:40（SSEDATE 即正式披露日期为 2026-09-21，公告落款 2026 年 9 月 21 日） | sse | `data/raw/announcements/600392_2026-043_clarification.txt` | https://www.sse.com.cn/disclosure/listedinfo/announcement/c/new/2026-09-21/600392_20260921_NOKE.pdf |
| doc_A05 | A | 财联社（B） | 盛和资源澄清：控股股东不存在拟对外转让公司控股权的情形 | 2026-09-20T15:54:26+08:00 | 财联社页面显示 2026年09月20日 15:54:26 | media_site | `data/raw/media/cls_2488207.txt` | https://www.cls.cn/detail/2488207 |
| doc_A06 | A | 财联社（B） | 突发！370亿稀土龙头澄清某稀土企业集团拟收购公司控股权传闻|盘后公告集锦 | 2026-09-20T18:20:00+08:00 | 财联社页面显示 2026-09-20 18:20 星期日（只到分钟） | media_site | `data/raw/media/cls_2488268.txt` | https://www.cls.cn/detail/2488268 |
| doc_A07 | A | 财联社（B） | 突发！370亿稀土龙头澄清某稀土企业集团拟收购公司控股权传闻|盘后公告集锦（新浪财经头条，财联社APP 账号） | 2026-09-20T18:20:00+08:00 | 新浪财经页面显示 2026年09月20日 18:20（只到分钟） | media_site | `data/raw/media/sina_cls.txt` | https://cj.sina.com.cn/articles/view/2868676035/aafc85c302001xp3a |
| doc_A08 | A | 财闻（C） | 中国稀土集团回应收购盛和资源传闻：不了解相关情况 | 2026-09-20T17:18:59+08:00 | 财闻页面显示 2026-09-20 17:18:59 | media_site | `data/raw/media/caiwen_1614781.txt` | https://www.caiwennews.com/article/1614781.shtml |
| doc_A09 | A | 财闻（C） | 中国稀土集团回应收购盛和资源传闻：不了解相关情况（同花顺转发，来源：财闻） | 2026-09-20T17:19:49+08:00 | 同花顺页面显示 2026-09-20 17:19:49，来源：财闻 | media_site | `data/raw/media/ths_680093715.txt` | http://stock.10jqka.com.cn/20260920/c680093715.shtml |
| doc_A10 | A | 时代周报（B） | 辟谣控股权易主！盛和资源海外稀土布局：包销终止仍持有MP股份，坦桑尼亚海外矿山仍卡在审批关口 | 2026-09-21T17:22:39+08:00 | 证券之星刊载页显示 2026-09-21 17:22:39（时代周报原站发布时间未找到） | media_site | `data/raw/media/stockstar_sdzb.txt` | https://wap.stockstar.com/detail/IG2026092100023810 |
| doc_A11 | A | 澎湃新闻（B） | 这家稀土龙头，连夜否认被央企收购 | 2026-09-21T18:43:00+08:00 | 页面显示「09月21日18:43」，HTML 元数据 article:published_time=2026-09-21 18:43:00 | media_site | `data/raw/media/sina_pengpai.txt` | https://finance.sina.cn/2026-09-21/detail-inisqvrw5715976.d.html |
| doc_A12 | A | 证券日报（B） | 盛和资源：产品量价齐升驱动业绩大增 | 2026-09-05T00:32:28+08:00 | 同花顺刊载页显示 2026-09-05 00:32:28，来源：证券日报 | media_site | `data/raw/media/ths_679622411.txt` | https://stock.10jqka.com.cn/20260905/c679622411.shtml |
| doc_A13 | A | 川观新闻（金融投资报）（B） | 四川稀土龙头否认控股权“被收购”！境外资产超67亿元，近年业绩猛增→ | 2026-09-21T18:24:00+08:00 | 川观新闻页面显示 2026-09-21 18:24（只到分钟） | media_site | `data/raw/media/cbgc_7979897.txt` | https://cbgc.scol.com.cn/news/7979897 |
| doc_A14 | A | 财闻（C） | 稀土龙头，紧急澄清（同花顺转发，来源：财闻） | 2026-09-20T16:32:25+08:00 | 同花顺页面显示 2026-09-20 16:32:25，来源：财闻（财闻原站页面未找到） | media_site | `data/raw/media/ths_680092614.txt` | http://stock.10jqka.com.cn/20260920/c680092614.shtml |
| doc_B01 | B | 上海证券交易所（上市公司公告）（S） | 无锡德林海环保科技股份有限公司2025年年度业绩预盈公告（2026-003） | 2026-01-29T15:36:04+08:00 | 上交所公告查询接口 ADDDATE=2026-01-29 15:36:04（SSEDATE 2026-01-30） | sse | `data/raw/announcements/688069_2026-003_forecast.txt` | https://www.sse.com.cn/disclosure/listedinfo/announcement/c/new/2026-01-30/688069_20260130_PZUI.pdf |
| doc_B02 | B | 上海证券交易所（上市公司公告）（S） | 无锡德林海环保科技股份有限公司2025年度业绩快报公告（2026-006） | 2026-02-26T15:32:58+08:00 | 上交所公告查询接口 ADDDATE=2026-02-26 15:32:58（SSEDATE 2026-02-27） | sse | `data/raw/announcements/688069_2026-006_express_layout.txt` | https://www.sse.com.cn/disclosure/listedinfo/announcement/c/new/2026-02-27/688069_20260227_I93P.pdf |
| doc_B03 | B | 上海证券交易所（上市公司公告）（S） | 无锡德林海环保科技股份有限公司关于子公司诉讼结果的公告（2026-007） | 2026-03-02T16:05:59+08:00 | 上交所公告查询接口 ADDDATE=2026-03-02 16:05:59（SSEDATE 2026-03-03） | sse | `data/raw/announcements/688069_2026-007_lawsuit_result.txt` | https://www.sse.com.cn/disclosure/listedinfo/announcement/c/new/2026-03-03/688069_20260303_0CPQ.pdf |
| doc_B04 | B | 上海证券交易所（上市公司公告）（S） | 无锡德林海环保科技股份有限公司关于子公司诉讼结果执行暨2025年度业绩预告、业绩快报的更正公告（2026-008） | 2026-03-17T15:52:56+08:00 | 上交所公告查询接口 ADDDATE=2026-03-17 15:52:56（SSEDATE 2026-03-18，公告落款 2026 年 3 月 18 日） | sse | `data/raw/announcements/688069_2026-008_correction.txt` | https://www.sse.com.cn/disclosure/listedinfo/announcement/c/new/2026-03-18/688069_20260318_X01V.pdf |
| doc_B05 | B | 财闻（C） | 计提4808万元预计负债予以冲回 德林海2025年净利润修正为约1亿元 | 2026-03-17T16:22:31+08:00 | 财闻页面显示 2026-03-17 16:22:31 | media_site | `data/raw/media/caiwen_1425859.txt` | https://www.caiwennews.com/article/1425859.shtml |
| doc_C01 | C | 博盈特焊投资者关系活动记录表（A） | 博盈特焊：2026年6月23日投资者关系活动记录表（编号 2026-021） | 2026-06-23T18:18:28+08:00 | 巨潮资讯网投资者关系栏目（hisAnnouncement/query, tabName=relation）announcementTime=2026-06-23 18:18:28 | cninfo | `data/raw/ir/301468_IR_20260623_original.txt` | http://static.cninfo.com.cn/finalpage/2026-06-23/1225383708.PDF |
| doc_C05 | C | 博盈特焊投资者关系活动记录表（A） | 博盈特焊：2026年6月25日投资者关系活动记录表 | 2026-06-25T18:20:28+08:00 | 巨潮资讯网投资者关系栏目 announcementTime=2026-06-25 18:20:28 | cninfo | `data/raw/ir/301468_IR_20260625.txt` | http://static.cninfo.com.cn/finalpage/2026-06-25/1225388181.PDF |
| doc_C02 | C | 深交所互动易（博盈特焊官方回复）（A） | 互动易回复：请问越南工厂原计划于二季度和7月投产的生产线目前进度如何？是否投产了？ | 2026-07-14T18:27:44+08:00 | 互动易接口 attachedPubDate（回复时间）=2026-07-14 18:27:44；提问时间 2026-07-14 15:11:24；indexId 2313072538854998016 | irm | `data/raw/irm/301468_boying_irm_qa.json#2313072538854998016` | https://irm.cninfo.com.cn/ircs/company/companyDetail?stockcode=301468&orgId=9900047230 |
| doc_C03 | C | 深交所互动易（博盈特焊官方回复）（A） | 互动易回复：第二期剩余2条HRSG生产线是否8月上旬己投入生产？ | 2026-08-12T18:21:10+08:00 | 互动易接口 attachedPubDate（回复时间）=2026-08-12 18:21:10；提问时间 2026-08-12 08:29:28；indexId 2334388323944443904 | irm | `data/raw/irm/301468_boying_irm_qa.json#2334388323944443904` | https://irm.cninfo.com.cn/ircs/company/companyDetail?stockcode=301468&orgId=9900047230 |
| doc_C04 | C | 财闻（C） | 博盈特焊：二期剩余2条HRSG生产线目前在安装中 预计将于8月份投产（同花顺转发，来源：财闻） | 2026-08-14T16:14:10+08:00 | 同花顺页面显示 2026-08-14 16:14:10，来源：财闻 | media_site | `data/raw/media/ths_678966598.txt` | https://stock.10jqka.com.cn/20260814/c678966598.shtml |
| doc_D01 | D | 上海证券交易所（上市公司公告）（S） | 盛和资源控股股份有限公司关于以集中竞价交易方式首次回购股份的公告（2026-041） | 2026-09-15T18:13:26+08:00 | 上交所公告查询接口 ADDDATE=2026-09-15 18:13:26（SSEDATE 2026-09-16） | sse | `data/raw/announcements/600392_2026-041_first_buyback.txt` | https://www.sse.com.cn/disclosure/listedinfo/announcement/c/new/2026-09-16/600392_20260916_YKSF.pdf |
| doc_D02 | D | 上海证券交易所（上市公司公告）（S） | 盛和资源控股股份有限公司关于股份回购进展公告（2026-044） | 2026-10-08T16:57:22+08:00 | 上交所公告查询接口 ADDDATE=2026-10-08 16:57:22（SSEDATE 2026-10-09） | sse | `data/raw/announcements/600392_2026-044_buyback_progress.txt` | https://www.sse.com.cn/disclosure/listedinfo/announcement/c/new/2026-10-09/600392_20261009_ZPX1.pdf |

## 行情数据

- 来源：东方财富公开行情接口（日线，前复权）。扶摇未接入，以公开渠道替代。
- 取数时间：见 `public/data/market.json` 的 `fetched_at`。
- 范围：600392.SH（2026-09-01 至 10-13）、688069.SH（2026-01-15 至 04-10）、301468.SZ（2026-06-08 至 09-30）、000300.SH 沪深 300（2026-01-15 至 10-13）。
