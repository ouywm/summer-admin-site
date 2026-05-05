import { useLang, usePages } from '@rspress/core/runtime';
import {
  getCustomMDXComponent,
  renderInlineMarkdown,
} from '@rspress/core/theme';
import React from 'react';
import { BlogAvatar } from './BlogAvatar';
import styles from './BlogList.module.css';

export interface BlogItem {
  title?: string;
  description?: string;
  date?: Date;
  link?: string;
  authors?: string[];
}

export const useBlogPages = (): BlogItem[] => {
  const { pages } = usePages();
  const lang = useLang();

  const blogPages = pages
    .filter((page) => page.lang === lang)
    .filter(
      (page) =>
        page.routePath.includes('/blog/') &&
        !page.routePath.endsWith('/blog/') &&
        !page.routePath.endsWith('/blog/index'),
    )
    .sort((a, b) => {
      const dateA = a.frontmatter?.date
        ? new Date(a.frontmatter?.date as string)
        : new Date(0);
      const dateB = b.frontmatter?.date
        ? new Date(b.frontmatter?.date as string)
        : new Date(0);
      return dateB.getTime() - dateA.getTime();
    });

  return blogPages.map(({ frontmatter, routePath, title }) => {
    const fm = (frontmatter ?? {}) as {
      description?: string;
      date?: string;
      authors?: string[];
    };
    const itemDate = fm.date ? new Date(fm.date) : undefined;
    return {
      date: itemDate,
      description: fm.description,
      link: routePath,
      title,
      authors: fm.authors,
    };
  });
};

export function BlogList() {
  const { a: A, p: P } = getCustomMDXComponent();
  const blogPages = useBlogPages();
  const lang = useLang();

  return (
    <div className={styles.list}>
      {blogPages.map(({ date, description, link, title, authors }, index) => {
        const formattedDate = date
          ? new Intl.DateTimeFormat(lang, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }).format(date)
          : null;

        return (
          <article key={link || index} className={styles.card}>
            <div className={styles.cardMain}>
              <div className={styles.titleRow}>
                <h2 className={styles.title} id={link}>
                  {title && <A href={link}>{title}</A>}
                </h2>
                {formattedDate && (
                  <time className={styles.date}>{formattedDate}</time>
                )}
              </div>
              {description && (
                <P
                  className={styles.description}
                  {...renderInlineMarkdown(description)}
                />
              )}
            </div>
            {authors && authors.length > 0 && (
              <div className={styles.cardAside}>
                {authors.map((author) => (
                  <BlogAvatar key={author} author={author} compact />
                ))}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
