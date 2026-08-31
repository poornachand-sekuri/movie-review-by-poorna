import { uiAsset } from './config.js';
import { mountComments } from './comments.js';

const $ = (selector, root = document) => root.querySelector(selector);

function cloneCommentsSection() {
  const template = $('#reviewTemplate');
  const source = template?.content?.querySelector('.comments-section');
  if (!source) throw new Error('Comments template is unavailable.');

  const section = source.cloneNode(true);
  section.classList.add('hm3-comments-section');
  section.setAttribute('aria-label', 'Share your opinion on Movie Reviews By Poorna');

  const header = $('.comments-header', section);
  if (header) {
    header.src = uiAsset('commentsHeader');
    header.decoding = 'async';
  }

  const background = $('.comments-bg', section);
  if (background) {
    background.style.backgroundImage = `url("${uiAsset('commentsShell')}")`;
  }

  return section;
}

function waitForHomePage() {
  const existing = $('.hm3-page');
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const target = $('#content') || document.body;
    const observer = new MutationObserver(() => {
      const page = $('.hm3-page');
      if (!page) return;
      observer.disconnect();
      clearTimeout(timeout);
      resolve(page);
    });

    const timeout = setTimeout(() => {
      observer.disconnect();
      reject(new Error('Home page did not finish loading.'));
    }, 10000);

    observer.observe(target, { childList: true, subtree: true });
  });
}

async function initHomeComments() {
  try {
    const page = await waitForHomePage();
    if ($('.hm3-comments-wrap', page)) return;

    const wrap = document.createElement('div');
    wrap.className = 'hm3-comments-wrap';
    wrap.append(cloneCommentsSection());
    page.append(wrap);

    await mountComments({
      targetType: 'home',
      targetId: 'home',
      root: wrap
    });
  } catch (error) {
    console.error('Unable to add Home-page comments:', error);
  }
}

initHomeComments();
