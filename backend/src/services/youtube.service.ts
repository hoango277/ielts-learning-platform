import crypto from 'node:crypto';
import { Innertube, Log } from 'youtubei.js';
import { config } from '../config.ts';
import { run } from '../db/index.ts';
import { TtlCache } from '../lib/http.ts';

/**
 * Truy cập YouTube qua InnerTube (API nội bộ mà chính youtube.com dùng) bằng thư viện youtubei.js:
 * không cần API key, không giới hạn quota như YouTube Data API. Video được phát bằng IFrame Player chính thức.
 */

Log.setLevel(Log.Level.NONE);

let ytPromise: Promise<Innertube> | null = null;
let ytCreatedAt = 0;

export function getYt(): Promise<Innertube> {
  // Làm mới phiên định kỳ để tránh visitor data hết hạn
  if (!ytPromise || Date.now() - ytCreatedAt > 6 * 3600_000) {
    ytCreatedAt = Date.now();
    ytPromise = Innertube.create({ lang: 'en', location: config.youtubeLocation, retrieve_player: false }).catch((err) => {
      ytPromise = null;
      throw err;
    });
  }
  return ytPromise;
}

export interface VideoCard {
  id: string;
  title: string;
  thumbnail: string;
  duration?: string;
  durationSec?: number;
  views?: string;
  published?: string;
  channel?: { id?: string; name?: string; avatar?: string };
  hasCaptions?: boolean;
  isLive?: boolean;
}

export interface ChannelInfo {
  id: string;
  name: string;
  handle?: string;
  avatar?: string;
  banner?: string;
  subscribers?: string;
  videoCount?: string;
  description?: string;
  tags?: string[];
}

/** Kênh học tiếng Anh được tuyển chọn (ID đã kiểm chứng). */
export const CURATED_CHANNELS: (Omit<ChannelInfo, 'avatar' | 'banner' | 'subscribers' | 'videoCount'> & {
  key: string;
})[] = [
  { key: 'bbc', id: 'UCHaHD477h-FeBbVh9Sh7syA', name: 'BBC Learning English', handle: '@bbclearningenglish', tags: ['news', 'vocab'] },
  { key: 'teded', id: 'UCsooa4yRKGN_zEE8iknghZA', name: 'TED-Ed', handle: '@TEDEd', tags: ['ted', 'science'] },
  { key: 'voa', id: 'UCKyTokYo0nK2OA-az-sDijA', name: 'VOA Learning English', handle: '@VOALearningEnglish', tags: ['news'] },
  { key: 'lucy', id: 'UCz4tgANd4yy8Oe0iXCdSWfA', name: 'English with Lucy', handle: '@EnglishwithLucy', tags: ['pronunciation', 'vocab'] },
  { key: 'ieltsadv', id: 'UCXg7gy4XmPZEGr4kumPNGyQ', name: 'IELTS Advantage', handle: '@ieltsadvantage', tags: ['ielts'] },
  { key: 'ted', id: 'UCAuUUnT6oDeKwE6v1NGQxug', name: 'TED', handle: '@TED', tags: ['ted'] },
  { key: 'rachel', id: 'UCvn_XCl_mgQmt3sD753zdJA', name: "Rachel's English", handle: '@rachelsenglish', tags: ['pronunciation'] },
  { key: 'ieltsliz', id: 'UCKPpfQUSfHhesyjbskDKSEg', name: 'IELTS Liz', handle: '@ieltsliz', tags: ['ielts'] },
  { key: 'e2', id: 'UCglDIsg_Z9mE2oT9hsrbzFA', name: 'E2 IELTS', handle: '@E2IELTS', tags: ['ielts'] },
  { key: 'ieltsofficial', id: 'UCcZJFoCjX0S9N4Gcn5tD3SA', name: 'IELTS Official', handle: '@IELTSOfficial', tags: ['ielts'] },
  { key: 'vanessa', id: 'UCxJGMJbjokfnr2-s4_RXPxQ', name: 'Speak English With Vanessa', handle: '@speakenglishwithvanessa', tags: ['conversation'] },
  { key: 'mmm', id: 'UCrRiVfHqBIIvSgKmgnSY66g', name: 'mmmEnglish', handle: '@mmmEnglish_Emma', tags: ['pronunciation', 'conversation'] },
  { key: 'tvseries', id: 'UCKgpamMlm872zkGDcBJHYDg', name: 'Learn English With TV Series', handle: '@LearnEnglishWithTVSeries', tags: ['movies'] },
  { key: 'easy', id: 'UCvgLaFuTGGRXl0eyvBRCifA', name: 'Easy English', handle: '@EasyEnglishVideos', tags: ['conversation', 'street'] },
  { key: 'speeches', id: 'UCLyr-hfWVCKHcZjV5fg3jbw', name: 'English Speeches', handle: '@EnglishSpeeches', tags: ['speech'] },
  { key: 'kurz', id: 'UCsXVk37bltHxD1rDPwtNM8Q', name: 'Kurzgesagt', handle: '@kurzgesagt', tags: ['science'] },
  { key: 'veritasium', id: 'UCHnyfMqiRRG1u-2MsSQLbXA', name: 'Veritasium', handle: '@veritasium', tags: ['science'] },
];

const byKey = (keys: string[]) => keys.map((k) => CURATED_CHANNELS.find((c) => c.key === k)!.id);

/** Các "chip" giống thanh danh mục của YouTube. */
export const FEED_CHIPS: { key: string; label: string; channels?: string[]; query?: string }[] = [
  { key: 'all', label: 'Tất cả', channels: byKey(['bbc', 'teded', 'voa', 'lucy', 'ieltsadv', 'ted', 'easy', 'ieltsliz', 'mmm', 'tvseries']) },
  { key: 'ielts', label: 'IELTS', channels: byKey(['ieltsadv', 'ieltsliz', 'e2', 'ieltsofficial']) },
  { key: 'ted', label: 'TED & TED-Ed', channels: byKey(['ted', 'teded']) },
  { key: 'news', label: 'Tin tức dễ nghe', channels: byKey(['bbc', 'voa']) },
  { key: 'pronunciation', label: 'Phát âm', channels: byKey(['rachel', 'lucy', 'mmm']) },
  { key: 'conversation', label: 'Hội thoại', channels: byKey(['easy', 'vanessa']) },
  { key: 'movies', label: 'Phim & TV', channels: byKey(['tvseries']) },
  { key: 'science', label: 'Khoa học', channels: byKey(['kurz', 'veritasium', 'teded']) },
  { key: 'speeches', label: 'Diễn thuyết', channels: byKey(['speeches', 'ted']) },
  { key: 'podcast', label: 'Podcast', query: 'English podcast for learners intermediate' },
  { key: 'stories', label: 'Truyện kể', query: 'learn English through story level 3' },
  { key: 'interview', label: 'Phỏng vấn', query: 'IELTS speaking mock test band 8' },
];

// ---------- Chuẩn hoá node của youtubei.js → VideoCard ----------

type AnyNode = Record<string, any>;

function str(x: unknown): string | undefined {
  if (x == null) return undefined;
  if (typeof x === 'string') return x;
  const s = String((x as { toString(): string }).toString());
  return s && s !== '[object Object]' && s !== 'N/A' ? s : undefined;
}

export function parseDuration(text?: string): number | undefined {
  if (!text || !/^\d+(:\d+)+$/.test(text.trim())) return undefined;
  return text
    .trim()
    .split(':')
    .map(Number)
    .reduce((acc, p) => acc * 60 + p, 0);
}

export const thumbFor = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

function fromVideoNode(n: AnyNode, fallback?: VideoCard['channel']): VideoCard | null {
  const id = n.video_id ?? n.id;
  if (!id || typeof id !== 'string') return null;
  const duration = str(n.length_text) ?? n.duration?.text;
  const badges: string[] = (n.badges ?? []).map((b: AnyNode) => b.label).filter(Boolean);
  return {
    id,
    title: str(n.title) ?? '',
    thumbnail: thumbFor(id),
    duration,
    durationSec: n.duration?.seconds || parseDuration(duration),
    views: str(n.short_view_count) ?? str(n.view_count),
    published: str(n.published),
    channel: n.author?.name && n.author.name !== 'N/A'
      ? { id: n.author.id, name: n.author.name, avatar: n.author.thumbnails?.[0]?.url }
      : fallback,
    hasCaptions: badges.includes('CC') || undefined,
    isLive: Boolean(n.is_live) || badges.includes('LIVE') || undefined,
  };
}

function fromLockup(n: AnyNode, fallback?: VideoCard['channel']): VideoCard | null {
  if (n.content_type !== 'VIDEO' || !n.content_id) return null;
  const id: string = n.content_id;
  const badges: string[] = (n.content_image?.overlays ?? []).flatMap((o: AnyNode) =>
    (o.badges ?? []).map((b: AnyNode) => str(b.text)).filter(Boolean),
  );
  const duration = badges.find((b) => /^\d+(:\d+)+$/.test(b));
  let channelName: string | undefined;
  let views: string | undefined;
  let published: string | undefined;
  for (const row of n.metadata?.metadata?.metadata_rows ?? []) {
    for (const part of row.metadata_parts ?? []) {
      const t = str(part.text)?.trim();
      if (!t) continue;
      if (/\bago$|^Streamed|^Premiere|^Scheduled/i.test(t)) published = t;
      else if (/^[\d.,]+[KMB]?$/i.test(t)) views = `${t} views`;
      else if (/views?$|watching$/i.test(t)) views = t;
      else if (!channelName) channelName = t;
    }
  }
  const avatar = n.metadata?.image?.avatar?.image?.[0]?.url ?? n.metadata?.image?.image?.[0]?.url;
  return {
    id,
    title: str(n.metadata?.title) ?? '',
    thumbnail: thumbFor(id),
    duration,
    durationSec: parseDuration(duration),
    views,
    published,
    channel: channelName ? { name: channelName, avatar, id: fallback?.id } : fallback,
    isLive: badges.some((b) => /live/i.test(b)) || undefined,
  };
}

export function toVideoCard(node: AnyNode | null | undefined, fallback?: VideoCard['channel']): VideoCard | null {
  if (!node) return null;
  switch (node.type) {
    case 'Video':
    case 'CompactVideo':
    case 'GridVideo':
    case 'PlaylistVideo':
      return fromVideoNode(node, fallback);
    case 'LockupView':
      return fromLockup(node, fallback);
    case 'RichItem':
      return toVideoCard(node.content, fallback);
    default:
      return null;
  }
}

function toCards(nodes: AnyNode[] | undefined, fallback?: VideoCard['channel']) {
  return (nodes ?? [])
    .map((n) => toVideoCard(n, fallback))
    .filter((v): v is VideoCard => Boolean(v && v.title && !v.isLive));
}

// ---------- Feed có phân trang (giống cuộn vô hạn của YouTube) ----------

type Page = { items: VideoCard[]; next?: () => Promise<Page> };

/** Trộn nhiều nguồn (nhiều kênh / kết quả tìm kiếm) theo vòng tròn, bỏ trùng. */
class MergedFeed {
  private sources: { buffer: VideoCard[]; next?: () => Promise<Page>; failed: boolean }[];
  private seen = new Set<string>();
  private pages: VideoCard[][] = [];
  private lock: Promise<unknown> = Promise.resolve();

  constructor(
    loaders: (() => Promise<Page>)[],
    private pageSize = 24,
  ) {
    this.sources = loaders.map((l) => ({ buffer: [], next: l, failed: false }));
  }

  get exhausted() {
    return this.sources.every((s) => !s.buffer.length && (!s.next || s.failed));
  }

  private async refill() {
    await Promise.all(
      this.sources.map(async (s) => {
        if (s.buffer.length || !s.next || s.failed) return;
        try {
          const page = await s.next();
          s.buffer.push(...page.items);
          s.next = page.next;
        } catch (err) {
          console.warn('[youtube] lỗi tải trang feed:', (err as Error).message);
          s.failed = true;
        }
      }),
    );
  }

  /** Lấy trang thứ `index` (idempotent: gọi lại cùng index trả cùng kết quả). */
  page(index: number): Promise<VideoCard[]> {
    const run = this.lock.then(async () => {
      while (this.pages.length <= index && !this.exhausted) {
        const out: VideoCard[] = [];
        let guard = 0;
        while (out.length < this.pageSize && guard++ < 50) {
          await this.refill();
          if (this.exhausted) break;
          for (const s of this.sources) {
            if (out.length >= this.pageSize) break;
            const item = s.buffer.shift();
            if (item && !this.seen.has(item.id)) {
              this.seen.add(item.id);
              out.push(item);
            }
          }
        }
        if (!out.length) break;
        this.pages.push(out);
      }
      return this.pages[index] ?? [];
    });
    this.lock = run.catch(() => undefined);
    return run;
  }

  hasPage(index: number) {
    return this.pages.length > index || !this.exhausted;
  }
}

const feeds = new TtlCache<MergedFeed>(30 * 60_000, 300);

async function readFeed(feedId: string, feed: MergedFeed, index: number) {
  const items = await feed.page(index);
  const more = items.length > 0 && feed.hasPage(index + 1);
  return { items, cursor: more ? `${feedId}.${index + 1}` : null };
}

function createFeed(loaders: (() => Promise<Page>)[], pageSize = 24, key?: string) {
  const feedId = key ?? crypto.randomBytes(6).toString('hex');
  const feed = new MergedFeed(loaders, pageSize);
  feeds.set(feedId, feed);
  return { feedId, feed };
}

async function continueFeed(cursor: string) {
  const [feedId, idx] = cursor.split('.');
  const feed = feeds.get(feedId);
  if (!feed) {
    const err = new Error('Phiên duyệt đã hết hạn, hãy tải lại trang') as Error & { status?: number };
    err.status = 410;
    throw err;
  }
  return readFeed(feedId, feed, Number(idx) || 0);
}

function searchLoader(query: string, filters: Record<string, unknown>): () => Promise<Page> {
  const wrap = (res: AnyNode): Page => ({
    items: toCards(res.videos ?? res.results),
    next: res.has_continuation ? async () => wrap(await res.getContinuation()) : undefined,
  });
  return async () => wrap(await (await getYt()).search(query, filters as never));
}

const channelMeta = new TtlCache<ChannelInfo>(24 * 3600_000, 200);

function channelLoader(channelId: string): () => Promise<Page> {
  return async () => {
    const yt = await getYt();
    const ch = await yt.getChannel(channelId);
    const info = channelInfoFrom(channelId, ch as AnyNode);
    channelMeta.set(channelId, info);
    const fallback = { id: channelId, name: info.name, avatar: info.avatar };
    const wrap = (list: AnyNode): Page => ({
      items: toCards(list.videos, fallback),
      next: list.has_continuation ? async () => wrap(await list.getContinuation()) : undefined,
    });
    return wrap(await ch.getVideos());
  };
}

function channelInfoFrom(id: string, ch: AnyNode): ChannelInfo {
  const header = JSON.stringify(ch.header ?? {});
  const curated = CURATED_CHANNELS.find((c) => c.id === id);
  return {
    id,
    name: ch.metadata?.title ?? curated?.name ?? '',
    handle: curated?.handle ?? ch.metadata?.vanity_channel_url?.split('/').pop(),
    avatar: ch.metadata?.avatar?.[0]?.url,
    banner: ch.header?.content?.banner?.image?.[0]?.url,
    subscribers: header.match(/"([\d.,]+[KMB]? subscribers?)"/)?.[1],
    videoCount: header.match(/"([\d.,]+[KMB]? videos?)"/)?.[1],
    description: ch.metadata?.description,
    tags: curated?.tags,
  };
}

// ---------- API công khai của service ----------

export async function getFeed(chipKey: string, cursor?: string) {
  if (cursor) return continueFeed(cursor);
  const chip = FEED_CHIPS.find((c) => c.key === chipKey) ?? FEED_CHIPS[0];
  const loaders = chip.channels
    ? chip.channels.map((id) => channelLoader(id))
    : [searchLoader(chip.query!, { type: 'video', features: ['subtitles'] })];
  const { feedId, feed } = createFeed(loaders);
  return readFeed(feedId, feed, 0);
}

export interface SearchFilters {
  duration?: 'short' | 'medium' | 'long';
  uploadDate?: 'today' | 'week' | 'month' | 'year';
  sortBy?: 'relevance' | 'upload_date' | 'view_count' | 'rating';
  captionsOnly?: boolean;
}

export async function searchVideos(query: string, filters: SearchFilters = {}, cursor?: string) {
  if (cursor) return continueFeed(cursor);
  const f: Record<string, unknown> = { type: 'video' };
  if (filters.duration) f.duration = filters.duration;
  if (filters.uploadDate) f.upload_date = filters.uploadDate;
  if (filters.sortBy) f.sort_by = filters.sortBy;
  if (filters.captionsOnly !== false) f.features = ['subtitles'];
  const { feedId, feed } = createFeed([searchLoader(query, f)], 20);
  return readFeed(feedId, feed, 0);
}

export async function searchSuggestions(query: string): Promise<string[]> {
  if (!query.trim()) return [];
  try {
    return (await (await getYt()).getSearchSuggestions(query)).slice(0, 10);
  } catch {
    return [];
  }
}

export async function getChannelVideos(channelId: string, cursor?: string) {
  if (cursor) return { ...(await continueFeed(cursor)), channel: channelMeta.get(channelId) ?? null };
  const { feedId, feed } = createFeed([channelLoader(channelId)], 30);
  const page = await readFeed(feedId, feed, 0);
  return { ...page, channel: channelMeta.get(channelId) ?? null };
}

/** Danh sách kênh tuyển chọn kèm avatar/subscriber (lấy song song, cache 24h). */
export async function getCuratedChannels(): Promise<ChannelInfo[]> {
  const yt = await getYt();
  return Promise.all(
    CURATED_CHANNELS.map(async (c) => {
      const cached = channelMeta.get(c.id);
      if (cached) return cached;
      try {
        const info = channelInfoFrom(c.id, (await yt.getChannel(c.id)) as AnyNode);
        channelMeta.set(c.id, info);
        return info;
      } catch {
        return { id: c.id, name: c.name, handle: c.handle, tags: c.tags };
      }
    }),
  );
}

export interface VideoDetails {
  id: string;
  title: string;
  description: string;
  durationSec: number;
  thumbnail: string;
  views?: number;
  published?: string;
  relativeDate?: string;
  keywords: string[];
  channel: { id?: string; name?: string; avatar?: string; subscribers?: string };
  related: VideoCard[];
  relatedCursor: string | null;
}

const detailsCache = new TtlCache<VideoDetails>(20 * 60_000, 200);

export function upsertVideoMeta(v: { id: string; title?: string; channelId?: string; channelName?: string; duration?: number; thumbnail?: string }) {
  run(
    `INSERT INTO videos (id, title, channel_id, channel_name, duration, thumbnail)
     VALUES (:id, :title, :channelId, :channelName, :duration, :thumbnail)
     ON CONFLICT(id) DO UPDATE SET
       title = CASE WHEN excluded.title != '' THEN excluded.title ELSE videos.title END,
       channel_id = COALESCE(excluded.channel_id, videos.channel_id),
       channel_name = COALESCE(excluded.channel_name, videos.channel_name),
       duration = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE videos.duration END,
       thumbnail = COALESCE(excluded.thumbnail, videos.thumbnail)`,
    {
      id: v.id,
      title: v.title ?? '',
      channelId: v.channelId ?? null,
      channelName: v.channelName ?? null,
      duration: v.duration ?? 0,
      thumbnail: v.thumbnail ?? thumbFor(v.id),
    },
  );
}

export async function getVideoDetails(id: string): Promise<VideoDetails> {
  const cached = detailsCache.get(id);
  if (cached) return cached;
  const yt = await getYt();
  const info = (await yt.getInfo(id)) as AnyNode;
  const b = info.basic_info ?? {};
  const owner = info.secondary_info?.owner;

  // Video liên quan có thể tải thêm (cuộn tiếp như YouTube)
  const wrap = (src: AnyNode): Page => ({
    items: toCards(src.watch_next_feed),
    next: async () => wrap(await src.getWatchNextContinuation()),
  });
  const { feedId, feed } = createFeed([async () => wrap(info)], 20);
  const related = await readFeed(feedId, feed, 0);

  const details: VideoDetails = {
    id,
    title: b.title ?? '',
    description: b.short_description ?? '',
    durationSec: b.duration ?? 0,
    thumbnail: thumbFor(id),
    views: b.view_count,
    published: str(info.primary_info?.published),
    relativeDate: str(info.primary_info?.relative_date),
    keywords: (b.keywords ?? []).slice(0, 15),
    channel: {
      id: b.channel_id ?? owner?.author?.id,
      name: b.author ?? owner?.author?.name,
      avatar: owner?.author?.thumbnails?.[0]?.url,
      subscribers: str(owner?.subscriber_count),
    },
    related: related.items,
    relatedCursor: related.cursor,
  };
  detailsCache.set(id, details);
  upsertVideoMeta({
    id,
    title: details.title,
    channelId: details.channel.id,
    channelName: details.channel.name,
    duration: details.durationSec,
  });
  return details;
}

export async function getRelated(cursor: string) {
  return continueFeed(cursor);
}
