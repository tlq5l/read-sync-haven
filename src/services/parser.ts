
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import TurndownService from 'turndown';

// Import types
import { Article } from './db';

// Create turndown service for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced'
});

// Add additional Turndown rules
turndownService.addRule('removeExtraLineBreaks', {
  filter: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  replacement: (content, node) => {
    return `\n\n${content}\n\n`;
  }
});

// URL validation
export function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

// Normalize URL
export function normalizeUrl(url: string): string {
  try {
    return new URL(url).toString();
  } catch (e) {
    return url;
  }
}

// Fetch HTML content from URL
export async function fetchHtml(url: string): Promise<string> {
  try {
    // We'll use a CORS proxy for the demo, but in a real app, 
    // this should be handled by a server-side API
    const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
    }
    
    return await response.text();
  } catch (error) {
    console.error('Error fetching HTML:', error);
    throw error;
  }
}

// Parse article content using Readability
export async function parseArticle(url: string): Promise<Omit<Article, '_id' | 'savedAt' | 'isRead' | 'favorite' | 'tags'>> {
  if (!isValidUrl(url)) {
    throw new Error('Invalid URL');
  }

  const normalizedUrl = normalizeUrl(url);
  const html = await fetchHtml(normalizedUrl);
  
  // Create a DOM from HTML
  const dom = new JSDOM(html, { url: normalizedUrl });
  const document = dom.window.document;
  
  // Use Readability to parse the article
  const reader = new Readability(document);
  const article = reader.parse();
  
  if (!article) {
    throw new Error('Could not parse article content');
  }
  
  // Sanitize HTML content
  const sanitizedHtml = DOMPurify.sanitize(article.content, {
    ALLOWED_TAGS: [
      'a', 'b', 'blockquote', 'br', 'caption', 'code', 'div', 'em',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'nl',
      'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody', 'td', 'th',
      'thead', 'tr', 'ul'
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class']
  });

  // Convert to Markdown
  const markdown = turndownService.turndown(sanitizedHtml);
  
  // Extract excerpt
  const excerpt = article.excerpt || article.textContent.substring(0, 280).trim() + '...';
  
  // Calculate estimated read time (average reading speed: 200 words per minute)
  const wordCount = article.textContent.split(/\s+/).length;
  const estimatedReadTime = Math.ceil(wordCount / 200);
  
  return {
    title: article.title,
    url: normalizedUrl,
    content: sanitizedHtml, // Store sanitized HTML
    excerpt,
    author: article.byline || undefined,
    siteName: article.siteName || new URL(normalizedUrl).hostname,
    estimatedReadTime,
    type: 'article'
  };
}

// Helper function to extract text content from HTML
export function extractTextFromHtml(html: string): string {
  const dom = new JSDOM(html);
  return dom.window.document.body.textContent || '';
}

// Helper function to convert HTML to Markdown
export function htmlToMarkdown(html: string): string {
  const sanitizedHtml = DOMPurify.sanitize(html);
  return turndownService.turndown(sanitizedHtml);
}
