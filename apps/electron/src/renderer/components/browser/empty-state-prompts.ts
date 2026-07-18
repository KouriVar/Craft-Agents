import type { BrowserEmptyPromptSample } from '@craft-agent/ui'

export const EMPTY_STATE_PROMPT_SAMPLES: readonly BrowserEmptyPromptSample[] = [
  {
    short: 'HN: summarize top 10 stories in a table',
    full: 'Use the browser to open https://news.ycombinator.com and summarize the top 10 stories in a table with columns: title, source domain, points, comments, and why it matters.',
  },
  {
    short: 'Product Hunt: compare today\'s top 5 launches',
    full: 'Use the browser to go to https://www.producthunt.com, find today\'s top 5 launches, and give me a comparison of product, category, pricing model, and ICP (ideal customer profile).',
  },
  {
    short: 'Observability pricing matrix (DD/New Relic/Grafana)',
    full: 'Use the browser to open https://www.datadoghq.com/pricing, https://newrelic.com/pricing, and https://grafana.com/pricing; build a side-by-side pricing matrix with plan names, monthly cost, free-tier limits, data retention, and overage pricing.',
  },
  {
    short: 'GitHub Docs: latest Actions updates',
    full: 'Use the browser to navigate to https://docs.github.com/en, find the latest updates related to GitHub Actions, and summarize actionable changes for a dev team in under 10 bullets.',
  },
  {
    short: 'UK policy feed: 5 latest announcements',
    full: 'Use the browser to go to https://www.gov.uk/search/news-and-communications and collect the 5 most recent policy announcements, including title, date, department, and one-line summary.',
  },
  {
    short: 'Booking.com: best Budapest stays next weekend',
    full: 'Use the browser to go to https://www.booking.com, search for hotels in Budapest for next weekend, and return the top 10 options sorted by review score with price per night, cancellation policy, and distance from city center.',
  },
  {
    short: 'Kaggle: shortlist 8 churn datasets',
    full: 'Use the browser to open https://www.kaggle.com/datasets, search for customer churn, shortlist 8 high-quality datasets, and rank them by usability for a quick ML prototype.',
  },
  {
    short: 'Status snapshot across OpenAI/GitHub/Cloudflare',
    full: 'Use the browser to visit https://status.openai.com, https://www.githubstatus.com, and https://www.cloudflarestatus.com; create a concise reliability snapshot with current status, active incidents, and affected components.',
  },
  {
    short: 'Figma Community: trending design systems',
    full: 'Use the browser to go to https://www.figma.com/community, find top trending design system files this week, and summarize which ones are best for SaaS dashboard UI inspiration.',
  },
  {
    short: 'Google Search docs: Core Web Vitals checklist',
    full: 'Use the browser to open https://developers.google.com/search/docs and extract all pages about Core Web Vitals; produce a practical checklist for engineering and SEO teams.',
  },
] as const

export const EMPTY_STATE_PROMPT_SAMPLES_ZH_HANS: readonly BrowserEmptyPromptSample[] = [
  {
    short: 'Hacker News：用表格汇总热门 10 条新闻',
    full: '使用浏览器打开 https://news.ycombinator.com，将排名前 10 的新闻整理成表格，包含标题、来源域名、积分、评论数和推荐理由。',
  },
  {
    short: 'Product Hunt：对比今日热门 5 款产品',
    full: '使用浏览器打开 https://www.producthunt.com，找出今天排名前 5 的新产品，并从产品名称、所属类别、定价模式和理想客户画像四个方面进行对比。',
  },
  {
    short: '可观测性服务价格对比（Datadog/New Relic/Grafana）',
    full: '使用浏览器分别打开 https://www.datadoghq.com/pricing、https://newrelic.com/pricing 和 https://grafana.com/pricing，制作横向价格对比表，包含套餐名称、月费、免费额度、数据保留期限和超额费用。',
  },
  {
    short: 'GitHub 文档：汇总 Actions 最新更新',
    full: '使用浏览器打开 https://docs.github.com/zh，查找 GitHub Actions 的最新更新，并用不超过 10 条要点总结对开发团队有实际影响的变化。',
  },
  {
    short: '英国政策动态：最近 5 条公告',
    full: '使用浏览器打开 https://www.gov.uk/search/news-and-communications，收集最近发布的 5 条政策公告，包含标题、日期、发布部门和一句话摘要。',
  },
  {
    short: 'Booking.com：查找下周末布达佩斯优质住宿',
    full: '使用浏览器打开 https://www.booking.com，搜索下周末布达佩斯的酒店，按评分从高到低列出 10 个优质选项，并包含每晚价格、取消政策和距市中心的距离。',
  },
  {
    short: 'Kaggle：筛选 8 个客户流失数据集',
    full: '使用浏览器打开 https://www.kaggle.com/datasets，搜索客户流失相关数据，筛选 8 个高质量数据集，并按其用于快速机器学习原型的易用程度排序。',
  },
  {
    short: 'OpenAI、GitHub 与 Cloudflare 服务状态速览',
    full: '使用浏览器访问 https://status.openai.com、https://www.githubstatus.com 和 https://www.cloudflarestatus.com，简要汇总各服务的当前状态、正在处理的故障以及受影响的组件。',
  },
  {
    short: 'Figma 社区：本周热门设计系统',
    full: '使用浏览器打开 https://www.figma.com/community，查找本周热门的设计系统文件，并总结哪些最适合作为 SaaS 仪表盘界面的设计参考。',
  },
  {
    short: 'Google 搜索文档：核心网页指标检查清单',
    full: '使用浏览器打开 https://developers.google.com/search/docs，查找所有与核心网页指标（Core Web Vitals）相关的页面，并为工程和 SEO 团队整理一份可执行的检查清单。',
  },
] as const

export function getEmptyStatePromptSamples(language?: string): readonly BrowserEmptyPromptSample[] {
  return language?.toLowerCase().startsWith('zh')
    ? EMPTY_STATE_PROMPT_SAMPLES_ZH_HANS
    : EMPTY_STATE_PROMPT_SAMPLES
}
