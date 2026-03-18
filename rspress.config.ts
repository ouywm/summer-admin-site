import * as path from 'node:path';
import { defineConfig } from '@rspress/core';

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  base: isProduction ? '/summer-admin-docs/' : '/',
  root: path.join(__dirname, 'docs'),
  title: 'Summer Admin Docs',
  icon: '/rspress-icon.png',
  logo: {
    light: '/rspress-light-logo.png',
    dark: '/rspress-dark-logo.png',
  },
  themeConfig: {
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/ouywm/summer-admin-docs',
      },
    ],
  },
});
