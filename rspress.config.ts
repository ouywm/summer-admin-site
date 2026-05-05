import * as path from 'node:path';
import { defineConfig } from '@rspress/core';
import { pluginRss } from '@rspress/plugin-rss';
import { pluginSitemap } from '@rspress/plugin-sitemap';
import { pluginChangelog } from 'rspress-plugin-changelog';
import pluginClarity from 'rspress-plugin-clarity';
import rspressPluginFileTree from 'rspress-plugin-file-tree';
import pluginGoogleAnalytics from 'rspress-plugin-google-analytics';
import rspressPluginMermaid from 'rspress-plugin-mermaid';
import rspressPluginReadingTime from 'rspress-plugin-reading-time';

const isProduction = process.env.NODE_ENV === 'production';
const siteUrl = 'https://ouywm.github.io/summer-admin-site/';

const plugins = [
  pluginSitemap({
    siteUrl,
    defaultChangeFreq: 'weekly',
    defaultPriority: '0.6',
  }),
  pluginRss({
    siteUrl,
    output: {
      dir: 'rss',
      type: 'rss',
    },
    feed: {
      id: 'updates',
      title: 'Summer Admin Docs Updates',
      description:
        'Summerrs Admin multilingual docs updates for onboarding, API, and MCP.',
      language: 'zh-CN',
      copyright: 'Copyright © 2026 Summer Admin Docs',
      test: (page) => {
        return (
          page.routePath.includes('/guide/') || page.routePath.includes('/api/')
        );
      },
    },
  }),
  rspressPluginReadingTime({
    defaultLocale: 'zh-CN',
  }),
  rspressPluginMermaid({
    mermaidConfig: {
      theme: 'neutral',
    },
  }),
  rspressPluginFileTree({
    initialExpandDepth: 2,
  }),
  pluginChangelog({
    fetchOnDev: false,
    items: [
      {
        type: 'github-releases',
        templatePath: './changelog.handlebars',
        routePath: '/changelog',
        repo: 'ouywm/summerrs-admin',
      },
    ],
  }),
];

const gaId = process.env.GA_ID;
if (gaId) {
  plugins.push(pluginGoogleAnalytics({ id: gaId }));
}

const clarityId = process.env.CLARITY_ID;
if (clarityId) {
  plugins.push(pluginClarity(clarityId) as any);
}

export default defineConfig({
  base: isProduction ? '/summer-admin-site/' : '/',
  root: path.join(__dirname, 'docs'),
  lang: 'zh',
  locales: [
    {
      lang: 'zh',
      label: '简体中文',
      title: 'Summer Admin Docs',
      description:
        'Summerrs Admin 的开发者文档站，覆盖快速开始、OpenAPI、MCP 与工作区模块说明。',
    },
    {
      lang: 'en',
      label: 'English',
      title: 'Summer Admin Docs',
      description:
        'Developer documentation for Summerrs Admin, covering quick start, OpenAPI, MCP, and workspace modules.',
    },
  ],
  multiVersion: {
    default: 'v0.1',
    versions: ['v0.1'],
  },
  ssg: true,
  llms: true,
  route: {
    // 排除 docs/components/ —— 这些是给 mdx 引用的 React 组件,不是文档页
    exclude: ['components/**/*'],
  },
  title: 'Summer Admin Docs',
  description:
    'Summerrs Admin 的开发者文档站，覆盖快速开始、OpenAPI、MCP 与工作区模块说明。',
  icon: '/logo-dark.png',
  logo: {
    light: '/logo-dark.png',
    dark: '/logo-dark.png',
  },
  plugins,
  globalUIComponents: [path.join(__dirname, 'theme', 'components', 'ConditionalGiscus.tsx')],
  themeConfig: {
    llmsUI: true,
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/ouywm/summerrs-admin',
      },
    ],
  },
});
