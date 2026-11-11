// Free Dictionary API (https://dictionaryapi.dev, dữ liệu Wiktionary — CC BY-SA)

export interface RawEntry {
  word: string;
  phonetic?: string;
  phonetics?: { text?: string; audio?: string }[];
  meanings?: {
    partOfSpeech: string;
    definitions: { definition: string; example?: string; synonyms?: string[]; antonyms?: string[] }[];
    synonyms?: string[];
    antonyms?: string[];
  }[];
  sourceUrls?: string[];
}

export interface DictEntry {
  word: string;
  ipa?: string;
  ipaUk?: string;
  ipaUs?: string;
  audioUk?: string;
  audioUs?: string;
  audio?: string;
  meanings: { pos: string; definitions: { definition: string; example?: string }[]; synonyms: string[]; antonyms: string[] }[];
  sourceUrl?: string;
}

export const dictApiUrl = (word: string) => `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;

export function normalizeEntries(entries: RawEntry[]): DictEntry | null {
  if (!entries.length) return null;
  const phonetics = entries.flatMap((e) => e.phonetics ?? []);
  const withAudio = (re: RegExp) => phonetics.find((p) => p.audio && re.test(p.audio));
  const uk = withAudio(/-uk\.mp3$/) ?? withAudio(/-au\.mp3$/);
  const us = withAudio(/-us\.mp3$/);
  const anyAudio = phonetics.find((p) => p.audio);
  const ipaList = phonetics.map((p) => p.text).filter(Boolean) as string[];
  const ipa = entries.find((e) => e.phonetic)?.phonetic ?? ipaList[0];

  // Gộp nghĩa theo từ loại từ nhiều entry
  const byPos = new Map<string, DictEntry['meanings'][number]>();
  for (const e of entries) {
    for (const m of e.meanings ?? []) {
      const cur = byPos.get(m.partOfSpeech) ?? { pos: m.partOfSpeech, definitions: [], synonyms: [], antonyms: [] };
      for (const d of m.definitions) {
        if (cur.definitions.length < 6) cur.definitions.push({ definition: d.definition, example: d.example });
        cur.synonyms.push(...(d.synonyms ?? []));
        cur.antonyms.push(...(d.antonyms ?? []));
      }
      cur.synonyms.push(...(m.synonyms ?? []));
      cur.antonyms.push(...(m.antonyms ?? []));
      byPos.set(m.partOfSpeech, cur);
    }
  }
  const meanings = [...byPos.values()].map((m) => ({
    ...m,
    synonyms: [...new Set(m.synonyms)].slice(0, 10),
    antonyms: [...new Set(m.antonyms)].slice(0, 8),
  }));

  return {
    word: entries[0].word,
    ipa,
    ipaUk: uk?.text ?? ipaList.find((t) => /əʊ/.test(t)) ?? ipa,
    ipaUs: us?.text ?? ipaList.find((t) => /oʊ/.test(t)) ?? ipa,
    audioUk: uk?.audio,
    audioUs: us?.audio,
    audio: us?.audio ?? uk?.audio ?? anyAudio?.audio,
    meanings,
    sourceUrl: entries[0].sourceUrls?.[0],
  };
}
