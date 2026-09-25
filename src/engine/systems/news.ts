import type { NewsItem, SimState } from '../types';
import { uid } from '../util';

const MAX_NEWS = 250;

export function addNews(
  s: SimState,
  headline: string,
  body: string,
  category: NewsItem['category'],
  sentiment: NewsItem['sentiment'] = 'neutral',
): void {
  s.news.unshift({ id: uid(s, 'n'), day: s.day, headline, body, category, sentiment });
  if (s.news.length > MAX_NEWS) s.news.length = MAX_NEWS;
}
