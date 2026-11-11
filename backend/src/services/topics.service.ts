import { all, get, parseJson, run, tx } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { addActivity, XP } from './activity.service.ts';
import type { Example } from './words.service.ts';

const NB_STATUS = `CASE WHEN w.id IS NULL THEN NULL WHEN w.known = 1 THEN 'known' WHEN w.state = 0 THEN 'new'
  WHEN w.state IN (1,3) THEN 'learning' WHEN w.stability >= 21 THEN 'mastered' ELSE 'reviewing' END`;

interface TopicRow {
  id: number;
  slug: string;
  name: string;
  name_vi: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  sort_order: number;
}

export interface LexiconRow {
  id: number;
  word: string;
  pos: string | null;
  ipa: string | null;
  ipa_us: string | null;
  audio: string | null;
  audio_us: string | null;
  meaning_vi: string;
  meanings_vi: string;
  definitions: string;
  examples: string;
  synonyms: string;
  antonyms: string;
  collocations: string;
  frequency: number | null;
  level: string | null;
}

export function toLexiconDTO(r: LexiconRow & { group_name?: string; word_id?: number | null; status?: string | null }) {
  return {
    id: r.id,
    word: r.word,
    pos: r.pos,
    ipa: r.ipa,
    ipaUs: r.ipa_us,
    audio: r.audio,
    audioUs: r.audio_us,
    meaning: r.meaning_vi,
    meanings: parseJson<{ pos: string; terms: string[] }[]>(r.meanings_vi, []),
    definitions: parseJson<{ pos: string; definition: string; example?: string }[]>(r.definitions, []),
    examples: parseJson<Example[]>(r.examples, []),
    synonyms: parseJson<string[]>(r.synonyms, []),
    antonyms: parseJson<string[]>(r.antonyms, []),
    collocations: parseJson<string[]>(r.collocations, []),
    frequency: r.frequency,
    level: r.level,
    group: r.group_name ?? null,
    wordId: r.word_id ?? null,
    status: r.status ?? null,
  };
}

function topicDTO(t: TopicRow & { word_count?: number; in_notebook?: number; mastered?: number; known?: number }) {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    nameVi: t.name_vi,
    description: t.description,
    icon: t.icon,
    color: t.color,
    category: t.category,
    wordCount: t.word_count ?? 0,
    inNotebook: t.in_notebook ?? 0,
    mastered: (t.mastered ?? 0) + (t.known ?? 0),
  };
}

export function listTopics() {
  const rows = all<TopicRow & { word_count: number; in_notebook: number; mastered: number; known: number }>(
    `SELECT t.*, COUNT(tw.lexicon_id) AS word_count,
            SUM(CASE WHEN w.id IS NOT NULL THEN 1 ELSE 0 END) AS in_notebook,
            SUM(CASE WHEN w.known = 0 AND w.stability >= 21 THEN 1 ELSE 0 END) AS mastered,
            SUM(CASE WHEN w.known = 1 THEN 1 ELSE 0 END) AS known
       FROM topics t
       LEFT JOIN topic_words tw ON tw.topic_id = t.id
       LEFT JOIN lexicon l ON l.id = tw.lexicon_id
       LEFT JOIN words w ON w.term_key = l.word AND w.user_id = :uid
      GROUP BY t.id ORDER BY t.sort_order, t.name`,
    { uid: currentUserId() },
  );
  const levels = all<{ topic_id: number; level: string; n: number }>(
    `SELECT tw.topic_id, COALESCE(l.level, '?') AS level, COUNT(*) AS n
       FROM topic_words tw JOIN lexicon l ON l.id = tw.lexicon_id GROUP BY tw.topic_id, l.level`,
  );
  return rows.map((r) => ({
    ...topicDTO(r),
    levels: Object.fromEntries(levels.filter((l) => l.topic_id === r.id).map((l) => [l.level, l.n])),
  }));
}

function findTopic(slug: string): TopicRow {
  const topic = get<TopicRow>('SELECT * FROM topics WHERE slug = ?', slug);
  if (!topic) {
    const err = new Error('Không tìm thấy chủ đề') as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return topic;
}

export function getTopic(slug: string) {
  const topic = findTopic(slug);
  const words = all<LexiconRow & { group_name: string; rank: number; word_id: number | null; status: string | null }>(
    `SELECT l.*, tw.group_name, tw.rank, w.id AS word_id, ${NB_STATUS} AS status
       FROM topic_words tw JOIN lexicon l ON l.id = tw.lexicon_id
       LEFT JOIN words w ON w.term_key = l.word AND w.user_id = :uid
      WHERE tw.topic_id = :topicId
      ORDER BY CASE tw.group_name WHEN 'core' THEN 0 ELSE 1 END, tw.rank`,
    { topicId: topic.id, uid: currentUserId() },
  ).map(toLexiconDTO);
  const stats = {
    wordCount: words.length,
    inNotebook: words.filter((w) => w.wordId).length,
    mastered: words.filter((w) => w.status === 'mastered' || w.status === 'known').length,
  };
  return { topic: { ...topicDTO(topic), ...stats }, words };
}

export function getLexiconEntry(id: number) {
  const row = get<LexiconRow & { word_id: number | null; status: string | null }>(
    `SELECT l.*, w.id AS word_id, ${NB_STATUS} AS status FROM lexicon l LEFT JOIN words w ON w.term_key = l.word AND w.user_id = :uid WHERE l.id = :id`,
    { id, uid: currentUserId() },
  );
  if (!row) {
    const err = new Error('Không tìm thấy từ') as Error & { status: number };
    err.status = 404;
    throw err;
  }
  const topics = all<{ slug: string; name: string; icon: string }>(
    'SELECT t.slug, t.name, t.icon FROM topic_words tw JOIN topics t ON t.id = tw.topic_id WHERE tw.lexicon_id = ?',
    id,
  );
  return { ...toLexiconDTO(row), topics };
}

/** Thêm từ của chủ đề vào sổ (không cần gọi mạng: dữ liệu đã crawl sẵn). known=true → đánh dấu "đã biết". */
export function addTopicWords(slug: string, opts: { lexiconIds?: number[]; known?: boolean }) {
  const topic = findTopic(slug);
  const rows = all<LexiconRow>(
    `SELECT l.* FROM topic_words tw JOIN lexicon l ON l.id = tw.lexicon_id WHERE tw.topic_id = ?`,
    topic.id,
  ).filter((r) => !opts.lexiconIds || opts.lexiconIds.includes(r.id));

  let added = 0;
  let updated = 0;
  const uid = currentUserId();
  tx(() => {
    for (const l of rows) {
      const existing = get<{ id: number; known: number }>('SELECT id, known FROM words WHERE user_id = ? AND term_key = ?', uid, l.word);
      if (existing) {
        if (opts.known !== undefined && Boolean(existing.known) !== opts.known) {
          run('UPDATE words SET known = ? WHERE id = ? AND user_id = ?', opts.known ? 1 : 0, existing.id, uid);
          updated++;
        }
        continue;
      }
      const defs = parseJson<{ definition: string }[]>(l.definitions, []);
      const examples = parseJson<Example[]>(l.examples, []).map((e) => ({ ...e, source: 'topic' }));
      run(
        `INSERT INTO words (user_id, term, term_key, pos, ipa, audio, meaning, definition, examples, synonyms, collocations, tags,
                            source_type, topic_id, lexicon_id, known)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'topic', ?, ?, ?)`,
        uid,
        l.word,
        l.word,
        l.pos,
        l.ipa_us ?? l.ipa,
        l.audio_us ?? l.audio,
        l.meaning_vi,
        defs[0]?.definition ?? '',
        JSON.stringify(examples),
        l.synonyms,
        l.collocations,
        JSON.stringify([topic.name]),
        topic.id,
        l.id,
        opts.known ? 1 : 0,
      );
      added++;
    }
    if (added) addActivity({ new_words: added, xp: Math.min(added, 20) * XP.newWord });
  });
  return { added, updated, total: rows.length };
}
