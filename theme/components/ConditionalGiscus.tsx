import { useLocation } from '@rspress/core/runtime';
import Giscus from '@giscus/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const FOOTER_SELECTOR = '.rp-doc-footer';

/**
 * Giscus 评论区的条件挂载版本 ——
 *  - 博客索引页(/blog/, /en/blog/)不挂载
 *  - 其他页面和官方 rspress-plugin-giscus 行为一致(挂到 .rp-doc-footer 之前)
 */
export default function ConditionalGiscus() {
  const location = useLocation();
  const pathname = location?.pathname || '';

  // 归一化:去掉 site base (/summer-admin-site) 和结尾 index.html
  const normalized = pathname
    .replace(/\/summer-admin-site/, '')
    .replace(/index\.html$/, '')
    .replace(/\/$/, '');

  const isBlogIndex = normalized === '/blog' || normalized === '/en/blog';

  if (isBlogIndex) {
    return null;
  }

  return <GiscusMount pathname={pathname} />;
}

function GiscusMount({ pathname }: { pathname: string }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const wrapperRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const place = () => {
      const footer = document.querySelector(FOOTER_SELECTOR);
      if (!footer?.parentElement) return null;
      const wrapper = document.createElement('div');
      wrapper.className = 'rspress-giscus-before-footer';
      wrapper.setAttribute('style', 'margin: 2rem 0;');
      footer.parentElement.insertBefore(wrapper, footer);
      wrapperRef.current = wrapper;
      setContainer(wrapper);
      return wrapper;
    };

    const el = place();
    if (!el) {
      const observer = new MutationObserver(() => {
        if (!wrapperRef.current) place();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const t = setTimeout(() => {
        observer.disconnect();
        if (!wrapperRef.current) place();
      }, 3000);
      return () => {
        clearTimeout(t);
        observer.disconnect();
        wrapperRef.current?.remove();
        wrapperRef.current = null;
        setContainer(null);
      };
    }
    return () => {
      wrapperRef.current?.remove();
      wrapperRef.current = null;
      setContainer(null);
    };
  }, [pathname]);

  if (!container) return null;

  return createPortal(
    <Giscus
      repo="ouywm/summer-admin-site"
      repoId="R_kgDORqqu0g"
      category="Q&A"
      categoryId="DIC_kwDORqqu0s4C7xga"
      mapping="pathname"
      lang="zh-CN"
      reactionsEnabled="1"
      emitMetadata="0"
      inputPosition="top"
    />,
    container,
  );
}
