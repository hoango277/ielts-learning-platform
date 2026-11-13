import continuous from './lesson-continuous.ts';
import future from './lesson-future.ts';
import pastPerfect from './lesson-past-perfect.ts';
import pastSimple from './lesson-past-simple.ts';
import presentPerfect from './lesson-present-perfect.ts';
import presentSimple from './lesson-present-simple.ts';
import { MIXED_PROMPTS } from './mixed.ts';
import type { Lesson, LessonId, LessonPack, TenseItem, WritingPrompt } from './types.ts';

/** Thứ tự học: hiện tại đơn → tiếp diễn → quá khứ đơn → hiện tại hoàn thành → tương lai → quá khứ hoàn thành */
export const LESSON_PACKS: LessonPack[] = [presentSimple, continuous, pastSimple, presentPerfect, future, pastPerfect].sort((a, b) => a.lesson.order - b.lesson.order);

export const LESSONS: Lesson[] = LESSON_PACKS.map((p) => p.lesson);
export const LESSON_BY_ID = new Map<LessonId, Lesson>(LESSONS.map((l) => [l.id, l]));
export const ALL_ITEMS: TenseItem[] = LESSON_PACKS.flatMap((p) => p.items);
export const ITEM_BY_ID = new Map<string, TenseItem>(ALL_ITEMS.map((i) => [i.id, i]));
export const ALL_PROMPTS: WritingPrompt[] = [...LESSON_PACKS.flatMap((p) => p.prompts), ...MIXED_PROMPTS];
export const PROMPT_BY_ID = new Map<string, WritingPrompt>(ALL_PROMPTS.map((p) => [p.id, p]));
export { MIXED_PROMPTS };
