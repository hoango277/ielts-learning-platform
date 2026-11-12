import { all, get, parseJson, run, tx } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { addActivity, XP } from './activity.service.ts';
import { ensureLexiconEntry, pruneLexicon } from './lexicon.service.ts';
import type { Example } from './words.service.ts';

const NB_STATUS = `CASE WHEN w.id IS NULL THEN NULL WHEN w.known = 1 THEN 'known' WHEN w.state = 0 THEN 'new'
  WHEN w.state IN (1,3) THEN 'learning' WHEN w.stability >= 21 THEN 'mastered' ELSE 'reviewing' END`;

/** Giới hạn cho "Bộ từ của tôi" (tránh một tài khoản làm phình cơ sở dữ liệu) */
export const MAX_OWN_TOPICS = 30;
export const MAX_TOPIC_WORDS = 500;

/** Bộ chủ đề người đang đăng nhập được thấy: bộ chung + bộ của chính mình */
export const visibleTopicsSql = (uid: number) => `SELECT id FROM topics WHERE user_id IS NULL OR user_id = ${Number(uid)}`;
/** Mục từ thuộc bộ chung (dùng cho đáp án nhiễu, bài test trình độ — không để lộ từ trong bộ riêng của người khác) */
export const SHARED_LEXICON_SQL = `SELECT tw.lexicon_id FROM topic_words tw JOIN topics t ON t.id = tw.topic_id WHERE t.user_id IS NULL`;

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
  user_id: number | null;
  source: string;
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

export function toLexiconDTO(r: LexiconRow & { group_name?: string; word_id?: number | null; status?: string | null; tw_source?: string }) {
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
    /** Ai thêm từ này vào bộ: seed (dữ liệu sẵn) | admin | user */
    addedBy: r.tw_source ?? null,
  };
}

/** Quyền sửa: bộ của mình; bộ chung thì chỉ quản trị viên */
const canEdit = (t: TopicRow, uid: number, isAdmin: boolean) => (t.user_id == null ? isAdmin : t.user_id === uid);

function topicDTO(t: TopicRow & { word_count?: number; in_notebook?: number; mastered?: number; known?: number }, uid: number, isAdmin: boolean) {
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
    /** Bộ từ riêng của người đang đăng nhập */
    mine: t.user_id != null && t.user_id === uid,
    source: t.source,
    editable: canEdit(t, uid, isAdmin),
  };
}

function httpError(status: number, message: string) {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

export function listTopics(isAdmin = false) {
  const uid = currentUserId();
  const rows = all<TopicRow & { word_count: number; in_notebook: number; mastered: number; known: number }>(
    `SELECT t.*, COUNT(tw.lexicon_id) AS word_count,
            SUM(CASE WHEN w.id IS NOT NULL THEN 1 ELSE 0 END) AS in_notebook,
            SUM(CASE WHEN w.known = 0 AND w.stability >= 21 THEN 1 ELSE 0 END) AS mastered,
            SUM(CASE WHEN w.known = 1 THEN 1 ELSE 0 END) AS known
       FROM topics t
       LEFT JOIN topic_words tw ON tw.topic_id = t.id
       LEFT JOIN lexicon l ON l.id = tw.lexicon_id
       LEFT JOIN words w ON w.term_key = l.word AND w.user_id = :uid
      WHERE t.user_id IS NULL OR t.user_id = :uid
      GROUP BY t.id ORDER BY CASE WHEN t.user_id IS NULL THEN 1 ELSE 0 END, t.sort_order, t.name`,
    { uid },
  );
  const levels = all<{ topic_id: number; level: string; n: number }>(
    `SELECT tw.topic_id, COALESCE(l.level, '?') AS level, COUNT(*) AS n
       FROM topic_words tw JOIN lexicon l ON l.id = tw.lexicon_id
      WHERE tw.topic_id IN (${visibleTopicsSql(uid)})
      GROUP BY tw.topic_id, l.level`,
  );
  return rows.map((r) => ({
    ...topicDTO(r, uid, isAdmin),
    levels: Object.fromEntries(levels.filter((l) => l.topic_id === r.id).map((l) => [l.level, l.n])),
  }));
}

/** Tìm bộ từ theo slug; bộ riêng của người khác coi như không tồn tại */
function findTopic(slug: string): TopicRow {
  const topic = get<TopicRow>('SELECT * FROM topics WHERE slug = ?', slug);
  if (!topic || (topic.user_id != null && topic.user_id !== currentUserId())) throw httpError(404, 'Không tìm thấy chủ đề');
  return topic;
}

function findEditable(slug: string, isAdmin: boolean): TopicRow {
  const topic = findTopic(slug);
  if (!canEdit(topic, currentUserId(), isAdmin)) throw httpError(403, 'Chỉ quản trị viên mới sửa được bộ từ chung.');
  return topic;
}

/** Người đang đăng nhập có được dùng bộ từ này không (luyện tập theo bộ) */
export function assertTopicVisible(topicId: number) {
  const t = get<{ user_id: number | null }>('SELECT user_id FROM topics WHERE id = ?', topicId);
  if (!t || (t.user_id != null && t.user_id !== currentUserId())) throw httpError(404, 'Không tìm thấy chủ đề');
}

export function getTopic(slug: string, isAdmin = false) {
  const topic = findTopic(slug);
  const uid = currentUserId();
  const words = all<LexiconRow & { group_name: string; rank: number; word_id: number | null; status: string | null; tw_source: string }>(
    `SELECT l.*, tw.group_name, tw.rank, tw.source AS tw_source, w.id AS word_id, ${NB_STATUS} AS status
       FROM topic_words tw JOIN lexicon l ON l.id = tw.lexicon_id
       LEFT JOIN words w ON w.term_key = l.word AND w.user_id = :uid
      WHERE tw.topic_id = :topicId
      ORDER BY CASE tw.group_name WHEN 'core' THEN 0 WHEN 'related' THEN 1 ELSE 2 END, tw.rank`,
    { topicId: topic.id, uid },
  ).map(toLexiconDTO);
  const stats = {
    wordCount: words.length,
    inNotebook: words.filter((w) => w.wordId).length,
    mastered: words.filter((w) => w.status === 'mastered' || w.status === 'known').length,
  };
  return { topic: { ...topicDTO(topic, uid, isAdmin), ...stats }, words };
}

export function getLexiconEntry(id: number) {
  const uid = currentUserId();
  const row = get<LexiconRow & { word_id: number | null; status: string | null }>(
    `SELECT l.*, w.id AS word_id, ${NB_STATUS} AS status FROM lexicon l LEFT JOIN words w ON w.term_key = l.word AND w.user_id = :uid WHERE l.id = :id`,
    { id, uid },
  );
  if (!row) throw httpError(404, 'Không tìm thấy từ');
  const topics = all<{ slug: string; name: string; icon: string }>(
    `SELECT t.slug, t.name, t.icon FROM topic_words tw JOIN topics t ON t.id = tw.topic_id
      WHERE tw.lexicon_id = ? AND (t.user_id IS NULL OR t.user_id = ?)`,
    id,
    uid,
  );
  return { ...toLexiconDTO(row), topics };
}

/** Thêm từ của chủ đề vào sổ (không cần gọi mạng: dữ liệu đã có sẵn). known=true → đánh dấu "đã biết". */
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

// ---------- Tạo / sửa bộ từ: "Bộ từ của tôi" (người học) và bộ chung (quản trị viên) ----------

export interface TopicInput {
  name: string;
  nameVi?: string;
  description?: string;
  icon?: string;
  color?: string;
}

/** Slug duy nhất, không trùng slug của dữ liệu crawl: "u12-k3x9q" (bộ riêng), "a-k3x9q" (bộ chung do admin tạo) */
function newSlug(prefix: string) {
  for (;;) {
    const slug = `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    if (!get('SELECT 1 FROM topics WHERE slug = ?', slug)) return slug;
  }
}

/** shared = bộ chung cho mọi người (chỉ admin); mặc định là bộ riêng của người tạo */
export function createTopic(input: TopicInput & { shared?: boolean }, isAdmin = false) {
  const uid = currentUserId();
  if (input.shared && !isAdmin) throw httpError(403, 'Chỉ quản trị viên mới tạo được bộ từ chung.');
  if (!input.shared) {
    const n = get<{ n: number }>('SELECT COUNT(*) AS n FROM topics WHERE user_id = ?', uid)!.n;
    if (n >= MAX_OWN_TOPICS) throw httpError(400, `Mỗi tài khoản tạo được tối đa ${MAX_OWN_TOPICS} bộ từ.`);
  }
  const slug = newSlug(input.shared ? 'a' : `u${uid}`);
  run(
    `INSERT INTO topics (slug, name, name_vi, description, icon, color, category, sort_order, user_id, source, created_at)
     VALUES (:slug, :name, :nameVi, :description, :icon, :color, :category, :order, :uid, :source, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
    {
      slug,
      name: input.name.trim(),
      nameVi: input.nameVi?.trim() ?? '',
      description: input.description?.trim() ?? '',
      icon: input.icon || '📚',
      color: input.color || 'teal',
      category: input.shared ? 'custom' : 'mine',
      order: 1000,
      uid: input.shared ? null : uid,
      source: input.shared ? 'admin' : 'user',
    },
  );
  return getTopic(slug, isAdmin).topic;
}

export function updateTopic(slug: string, input: Partial<TopicInput>, isAdmin = false) {
  const t = findEditable(slug, isAdmin);
  run(
    `UPDATE topics SET name = :name, name_vi = :nameVi, description = :description, icon = :icon, color = :color WHERE id = :id`,
    {
      id: t.id,
      name: input.name?.trim() || t.name,
      nameVi: input.nameVi?.trim() ?? t.name_vi,
      description: input.description?.trim() ?? t.description,
      icon: input.icon || t.icon,
      color: input.color || t.color,
    },
  );
  return getTopic(slug, isAdmin).topic;
}

/** Xoá bộ từ do người học / admin tạo. Bộ của dữ liệu crawl không xoá được (nạp lại sẽ xuất hiện lại). */
export function deleteTopic(slug: string, isAdmin = false) {
  const t = findEditable(slug, isAdmin);
  if (t.source === 'seed') throw httpError(400, 'Không xoá được chủ đề có sẵn của bộ từ IELTS.');
  const ids = all<{ lexicon_id: number }>('SELECT lexicon_id FROM topic_words WHERE topic_id = ?', t.id).map((r) => r.lexicon_id);
  tx(() => {
    run('DELETE FROM topics WHERE id = ?', t.id);
    pruneLexicon(ids);
  });
  return { ok: true };
}

/**
 * Thêm một từ/cụm từ vào bộ: tra và tạo mục từ nếu kho chưa có (mất vài giây), rồi gắn vào bộ.
 * Bộ chung: admin thêm vào nhóm tuỳ chọn (mặc định "từ liên quan"); bộ riêng: một nhóm duy nhất.
 */
export async function addTopicEntry(slug: string, term: string, opts: { group?: 'core' | 'related' | 'advanced' }, isAdmin = false) {
  const t = findEditable(slug, isAdmin);
  const count = get<{ n: number }>('SELECT COUNT(*) AS n FROM topic_words WHERE topic_id = ?', t.id)!.n;
  if (count >= MAX_TOPIC_WORDS) throw httpError(400, `Mỗi bộ từ có tối đa ${MAX_TOPIC_WORDS} từ.`);
  const entry = await ensureLexiconEntry(term);
  const already = get('SELECT 1 FROM topic_words WHERE topic_id = ? AND lexicon_id = ?', t.id, entry.id);
  if (!already) {
    const rank = get<{ r: number | null }>('SELECT MAX(rank) AS r FROM topic_words WHERE topic_id = ?', t.id)!.r ?? 0;
    run(
      `INSERT INTO topic_words (topic_id, lexicon_id, group_name, rank, source, added_at)
       VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
      t.id,
      entry.id,
      t.user_id == null ? (opts.group ?? 'related') : 'related',
      rank + 1,
      t.user_id == null ? 'admin' : 'user',
    );
  }
  const word = getTopic(slug, isAdmin).words.find((w) => w.id === entry.id)!;
  return { word, created: entry.created, alreadyInTopic: Boolean(already) };
}

/** Bỏ một từ khỏi bộ. Bộ chung: chỉ bỏ được từ admin đã thêm (từ của dữ liệu crawl sẽ quay lại khi nạp lại). */
export function removeTopicEntry(slug: string, lexiconId: number, isAdmin = false) {
  const t = findEditable(slug, isAdmin);
  const row = get<{ source: string }>('SELECT source FROM topic_words WHERE topic_id = ? AND lexicon_id = ?', t.id, lexiconId);
  if (!row) throw httpError(404, 'Từ này không có trong bộ.');
  if (row.source === 'seed') throw httpError(400, 'Không bỏ được từ có sẵn của bộ từ IELTS.');
  tx(() => {
    run('DELETE FROM topic_words WHERE topic_id = ? AND lexicon_id = ?', t.id, lexiconId);
    pruneLexicon([lexiconId]);
  });
  return { ok: true };
}
