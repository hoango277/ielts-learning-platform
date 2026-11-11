// Mỗi migration chỉ chạy một lần, theo thứ tự id
export const MIGRATIONS: { id: number; sql: string }[] = [
  {
    id: 1,
    sql: /* sql */ `
      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- Video người dùng đã mở / lưu
      CREATE TABLE videos (
        id               TEXT PRIMARY KEY,
        title            TEXT NOT NULL DEFAULT '',
        channel_id       TEXT,
        channel_name     TEXT,
        duration         INTEGER NOT NULL DEFAULT 0,
        thumbnail        TEXT,
        saved            INTEGER NOT NULL DEFAULT 0,
        last_position    REAL NOT NULL DEFAULT 0,
        watch_seconds    INTEGER NOT NULL DEFAULT 0,
        shadow_count     INTEGER NOT NULL DEFAULT 0,
        dictation_count  INTEGER NOT NULL DEFAULT 0,
        created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        last_watched_at  TEXT
      );

      CREATE TABLE transcripts (
        video_id    TEXT NOT NULL,
        lang        TEXT NOT NULL,
        kind        TEXT NOT NULL,
        track_name  TEXT,
        data        TEXT NOT NULL,
        fetched_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        PRIMARY KEY (video_id, lang)
      );

      -- Câu trong transcript, dùng để tìm "từ này xuất hiện ở video nào" (giống YouGlish)
      CREATE TABLE transcript_sentences (
        video_id  TEXT NOT NULL,
        idx       INTEGER NOT NULL,
        start     REAL NOT NULL,
        end       REAL NOT NULL,
        text      TEXT NOT NULL,
        PRIMARY KEY (video_id, idx)
      );

      CREATE TABLE video_notes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id    TEXT NOT NULL,
        time        REAL,
        content     TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX idx_video_notes_video ON video_notes(video_id);

      CREATE TABLE translation_cache (
        key         TEXT PRIMARY KEY,
        result      TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE dictionary_cache (
        word        TEXT PRIMARY KEY,
        data        TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      -- Bộ từ theo chủ đề (dữ liệu crawl)
      CREATE TABLE topics (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        slug         TEXT NOT NULL UNIQUE,
        name         TEXT NOT NULL,
        name_vi      TEXT NOT NULL DEFAULT '',
        description  TEXT NOT NULL DEFAULT '',
        icon         TEXT NOT NULL DEFAULT '📚',
        color        TEXT NOT NULL DEFAULT 'violet',
        category     TEXT NOT NULL DEFAULT 'ielts',
        sort_order   INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE lexicon (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        word          TEXT NOT NULL UNIQUE,
        pos           TEXT,
        ipa           TEXT,
        ipa_us        TEXT,
        audio         TEXT,
        audio_us      TEXT,
        meaning_vi    TEXT NOT NULL DEFAULT '',
        meanings_vi   TEXT NOT NULL DEFAULT '[]',
        definitions   TEXT NOT NULL DEFAULT '[]',
        examples      TEXT NOT NULL DEFAULT '[]',
        synonyms      TEXT NOT NULL DEFAULT '[]',
        antonyms      TEXT NOT NULL DEFAULT '[]',
        collocations  TEXT NOT NULL DEFAULT '[]',
        frequency     REAL,
        level         TEXT,
        source        TEXT,
        updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE topic_words (
        topic_id    INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
        lexicon_id  INTEGER NOT NULL REFERENCES lexicon(id) ON DELETE CASCADE,
        group_name  TEXT NOT NULL DEFAULT 'related',
        rank        INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (topic_id, lexicon_id)
      );
      CREATE INDEX idx_topic_words_lexicon ON topic_words(lexicon_id);

      -- Sổ từ vựng của người học + trạng thái lặp lại ngắt quãng (FSRS)
      CREATE TABLE words (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        term            TEXT NOT NULL,
        term_key        TEXT NOT NULL UNIQUE,
        pos             TEXT,
        ipa             TEXT,
        audio           TEXT,
        meaning         TEXT NOT NULL DEFAULT '',
        definition      TEXT NOT NULL DEFAULT '',
        examples        TEXT NOT NULL DEFAULT '[]',
        synonyms        TEXT NOT NULL DEFAULT '[]',
        collocations    TEXT NOT NULL DEFAULT '[]',
        note            TEXT NOT NULL DEFAULT '',
        tags            TEXT NOT NULL DEFAULT '[]',
        source_type     TEXT NOT NULL DEFAULT 'manual',
        video_id        TEXT,
        video_time      REAL,
        topic_id        INTEGER REFERENCES topics(id) ON DELETE SET NULL,
        lexicon_id      INTEGER REFERENCES lexicon(id) ON DELETE SET NULL,
        starred         INTEGER NOT NULL DEFAULT 0,
        known           INTEGER NOT NULL DEFAULT 0,
        due             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        stability       REAL NOT NULL DEFAULT 0,
        difficulty      REAL NOT NULL DEFAULT 0,
        elapsed_days    INTEGER NOT NULL DEFAULT 0,
        scheduled_days  INTEGER NOT NULL DEFAULT 0,
        learning_steps  INTEGER NOT NULL DEFAULT 0,
        reps            INTEGER NOT NULL DEFAULT 0,
        lapses          INTEGER NOT NULL DEFAULT 0,
        state           INTEGER NOT NULL DEFAULT 0,
        last_review     TEXT,
        correct_count   INTEGER NOT NULL DEFAULT 0,
        wrong_count     INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX idx_words_due ON words(due);
      CREATE INDEX idx_words_state ON words(state, known);
      CREATE INDEX idx_words_lexicon ON words(lexicon_id);
      CREATE INDEX idx_words_video ON words(video_id);

      CREATE TABLE review_logs (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        word_id         INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
        rating          INTEGER NOT NULL,
        mode            TEXT NOT NULL DEFAULT 'flashcard',
        state           INTEGER NOT NULL,
        due             TEXT,
        stability       REAL,
        difficulty      REAL,
        scheduled_days  INTEGER,
        prev            TEXT,
        xp              INTEGER NOT NULL DEFAULT 0,
        reviewed_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX idx_review_logs_time ON review_logs(reviewed_at);
      CREATE INDEX idx_review_logs_word ON review_logs(word_id);

      -- Hoạt động theo ngày (giờ địa phương) cho streak, heatmap, XP
      CREATE TABLE activity (
        day                  TEXT PRIMARY KEY,
        xp                   INTEGER NOT NULL DEFAULT 0,
        reviews              INTEGER NOT NULL DEFAULT 0,
        new_words            INTEGER NOT NULL DEFAULT 0,
        practice_total       INTEGER NOT NULL DEFAULT 0,
        practice_correct     INTEGER NOT NULL DEFAULT 0,
        watch_seconds        INTEGER NOT NULL DEFAULT 0,
        shadow_sentences     INTEGER NOT NULL DEFAULT 0,
        dictation_sentences  INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE practice_sessions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        mode          TEXT NOT NULL,
        total         INTEGER NOT NULL,
        correct       INTEGER NOT NULL,
        duration_sec  INTEGER NOT NULL DEFAULT 0,
        xp            INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
    `,
  },
  {
    // Đăng nhập nhiều người dùng. Dữ liệu học có cột user_id; user_id = 0 là dữ liệu tạo trước khi có tài khoản,
    // sẽ được chuyển cho tài khoản đầu tiên đăng ký. Bộ từ chủ đề, phụ đề, cache dịch vẫn dùng chung.
    id: 2,
    sql: /* sql */ `
      CREATE TABLE users (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name           TEXT NOT NULL,
        password_hash  TEXT NOT NULL,
        created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        last_login_at  TEXT
      );

      -- id = SHA-256 của token trong cookie (không lưu token gốc)
      CREATE TABLE sessions (
        id          TEXT PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ttl_sec     INTEGER NOT NULL,
        expires_at  TEXT NOT NULL,
        user_agent  TEXT,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);

      -- words: term_key chỉ còn duy nhất trong phạm vi một người dùng → dựng lại bảng
      CREATE TABLE words_new (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id         INTEGER NOT NULL DEFAULT 0,
        term            TEXT NOT NULL,
        term_key        TEXT NOT NULL,
        pos             TEXT,
        ipa             TEXT,
        audio           TEXT,
        meaning         TEXT NOT NULL DEFAULT '',
        definition      TEXT NOT NULL DEFAULT '',
        examples        TEXT NOT NULL DEFAULT '[]',
        synonyms        TEXT NOT NULL DEFAULT '[]',
        collocations    TEXT NOT NULL DEFAULT '[]',
        note            TEXT NOT NULL DEFAULT '',
        tags            TEXT NOT NULL DEFAULT '[]',
        source_type     TEXT NOT NULL DEFAULT 'manual',
        video_id        TEXT,
        video_time      REAL,
        topic_id        INTEGER REFERENCES topics(id) ON DELETE SET NULL,
        lexicon_id      INTEGER REFERENCES lexicon(id) ON DELETE SET NULL,
        starred         INTEGER NOT NULL DEFAULT 0,
        known           INTEGER NOT NULL DEFAULT 0,
        due             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        stability       REAL NOT NULL DEFAULT 0,
        difficulty      REAL NOT NULL DEFAULT 0,
        elapsed_days    INTEGER NOT NULL DEFAULT 0,
        scheduled_days  INTEGER NOT NULL DEFAULT 0,
        learning_steps  INTEGER NOT NULL DEFAULT 0,
        reps            INTEGER NOT NULL DEFAULT 0,
        lapses          INTEGER NOT NULL DEFAULT 0,
        state           INTEGER NOT NULL DEFAULT 0,
        last_review     TEXT,
        correct_count   INTEGER NOT NULL DEFAULT 0,
        wrong_count     INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE (user_id, term_key)
      );
      INSERT INTO words_new (id, user_id, term, term_key, pos, ipa, audio, meaning, definition, examples, synonyms, collocations,
                             note, tags, source_type, video_id, video_time, topic_id, lexicon_id, starred, known, due, stability,
                             difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review,
                             correct_count, wrong_count, created_at, updated_at)
        SELECT id, 0, term, term_key, pos, ipa, audio, meaning, definition, examples, synonyms, collocations,
               note, tags, source_type, video_id, video_time, topic_id, lexicon_id, starred, known, due, stability,
               difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review,
               correct_count, wrong_count, created_at, updated_at
          FROM words;
      DROP TABLE words;
      ALTER TABLE words_new RENAME TO words;
      CREATE INDEX idx_words_due ON words(user_id, due);
      CREATE INDEX idx_words_state ON words(user_id, state, known);
      CREATE INDEX idx_words_lexicon ON words(lexicon_id);
      CREATE INDEX idx_words_video ON words(user_id, video_id);

      ALTER TABLE review_logs ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX idx_review_logs_user ON review_logs(user_id, reviewed_at);

      -- activity: khoá chính (user_id, day)
      CREATE TABLE activity_new (
        user_id              INTEGER NOT NULL DEFAULT 0,
        day                  TEXT NOT NULL,
        xp                   INTEGER NOT NULL DEFAULT 0,
        reviews              INTEGER NOT NULL DEFAULT 0,
        new_words            INTEGER NOT NULL DEFAULT 0,
        practice_total       INTEGER NOT NULL DEFAULT 0,
        practice_correct     INTEGER NOT NULL DEFAULT 0,
        watch_seconds        INTEGER NOT NULL DEFAULT 0,
        shadow_sentences     INTEGER NOT NULL DEFAULT 0,
        dictation_sentences  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day)
      );
      INSERT INTO activity_new (user_id, day, xp, reviews, new_words, practice_total, practice_correct, watch_seconds,
                                shadow_sentences, dictation_sentences)
        SELECT 0, day, xp, reviews, new_words, practice_total, practice_correct, watch_seconds, shadow_sentences, dictation_sentences
          FROM activity;
      DROP TABLE activity;
      ALTER TABLE activity_new RENAME TO activity;

      ALTER TABLE practice_sessions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE video_notes ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX idx_video_notes_user ON video_notes(user_id, video_id);

      -- Cài đặt theo người dùng
      CREATE TABLE user_settings (
        user_id  INTEGER NOT NULL DEFAULT 0,
        key      TEXT NOT NULL,
        value    TEXT NOT NULL,
        PRIMARY KEY (user_id, key)
      );
      INSERT INTO user_settings (user_id, key, value) SELECT 0, key, value FROM settings;
      DROP TABLE settings;

      -- Tiến độ xem video theo người dùng; bảng videos chỉ còn metadata dùng chung
      CREATE TABLE user_videos (
        user_id          INTEGER NOT NULL DEFAULT 0,
        video_id         TEXT NOT NULL,
        saved            INTEGER NOT NULL DEFAULT 0,
        last_position    REAL NOT NULL DEFAULT 0,
        watch_seconds    INTEGER NOT NULL DEFAULT 0,
        shadow_count     INTEGER NOT NULL DEFAULT 0,
        dictation_count  INTEGER NOT NULL DEFAULT 0,
        created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        last_watched_at  TEXT,
        PRIMARY KEY (user_id, video_id)
      );
      INSERT INTO user_videos (user_id, video_id, saved, last_position, watch_seconds, shadow_count, dictation_count,
                               created_at, last_watched_at)
        SELECT 0, id, saved, last_position, watch_seconds, shadow_count, dictation_count, created_at, last_watched_at
          FROM videos
         WHERE saved = 1 OR last_watched_at IS NOT NULL OR watch_seconds > 0 OR shadow_count > 0 OR dictation_count > 0;
      ALTER TABLE videos DROP COLUMN saved;
      ALTER TABLE videos DROP COLUMN last_position;
      ALTER TABLE videos DROP COLUMN watch_seconds;
      ALTER TABLE videos DROP COLUMN shadow_count;
      ALTER TABLE videos DROP COLUMN dictation_count;
      ALTER TABLE videos DROP COLUMN last_watched_at;
    `,
  },
  {
    // Mẫu câu & cụm từ, luyện nói, 4/3/2, hồ sơ từ, độ khó video, kế hoạch học mỗi ngày
    id: 3,
    sql: /* sql */ `
      -- Câu lưu từ video (kèm cụm cần học) + trạng thái FSRS riêng
      CREATE TABLE phrases (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id         INTEGER NOT NULL DEFAULT 0,
        video_id        TEXT,
        start           REAL,
        end             REAL,
        sentence        TEXT NOT NULL,
        sentence_key    TEXT NOT NULL,
        sentence_vi     TEXT NOT NULL DEFAULT '',
        chunk           TEXT NOT NULL DEFAULT '',
        chunk_vi        TEXT NOT NULL DEFAULT '',
        note            TEXT NOT NULL DEFAULT '',
        due             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        stability       REAL NOT NULL DEFAULT 0,
        difficulty      REAL NOT NULL DEFAULT 0,
        elapsed_days    INTEGER NOT NULL DEFAULT 0,
        scheduled_days  INTEGER NOT NULL DEFAULT 0,
        learning_steps  INTEGER NOT NULL DEFAULT 0,
        reps            INTEGER NOT NULL DEFAULT 0,
        lapses          INTEGER NOT NULL DEFAULT 0,
        state           INTEGER NOT NULL DEFAULT 0,
        last_review     TEXT,
        speak_count     INTEGER NOT NULL DEFAULT 0,
        best_score      REAL,
        created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE (user_id, sentence_key, chunk)
      );
      CREATE INDEX idx_phrases_due ON phrases(user_id, due);
      CREATE INDEX idx_phrases_video ON phrases(user_id, video_id);

      CREATE TABLE phrase_logs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL DEFAULT 0,
        phrase_id    INTEGER NOT NULL REFERENCES phrases(id) ON DELETE CASCADE,
        rating       INTEGER NOT NULL,
        mode         TEXT NOT NULL DEFAULT 'flashcard',
        state        INTEGER NOT NULL,
        prev         TEXT,
        xp           INTEGER NOT NULL DEFAULT 0,
        reviewed_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX idx_phrase_logs_user ON phrase_logs(user_id, reviewed_at);

      -- Mỗi lượt luyện nói lại (câu có chỗ trống, nghe-chờ-nói, tự đặt câu, gợi ý tiếng Việt)
      CREATE TABLE speaking_attempts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL DEFAULT 0,
        mode        TEXT NOT NULL,
        phrase_id   INTEGER REFERENCES phrases(id) ON DELETE SET NULL,
        word_id     INTEGER REFERENCES words(id) ON DELETE SET NULL,
        transcript  TEXT NOT NULL DEFAULT '',
        score       REAL,
        passed      INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX idx_speaking_user ON speaking_attempts(user_id, created_at);

      -- Luyện nói trôi chảy 4/3/2
      CREATE TABLE fluency_sessions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL DEFAULT 0,
        topic       TEXT NOT NULL,
        prompts     TEXT NOT NULL DEFAULT '[]',
        notes       TEXT NOT NULL DEFAULT '',
        rounds_plan TEXT NOT NULL DEFAULT '[240,180,120]',
        completed   INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX idx_fluency_user ON fluency_sessions(user_id, created_at);

      CREATE TABLE fluency_rounds (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id     INTEGER NOT NULL REFERENCES fluency_sessions(id) ON DELETE CASCADE,
        user_id        INTEGER NOT NULL DEFAULT 0,
        round          INTEGER NOT NULL,
        target_sec     INTEGER NOT NULL,
        duration_sec   REAL NOT NULL,
        speech_sec     REAL NOT NULL DEFAULT 0,
        word_count     INTEGER NOT NULL DEFAULT 0,
        wpm            REAL NOT NULL DEFAULT 0,
        pause_count    INTEGER NOT NULL DEFAULT 0,
        long_pauses    INTEGER NOT NULL DEFAULT 0,
        pause_sec      REAL NOT NULL DEFAULT 0,
        mean_run       REAL NOT NULL DEFAULT 0,
        filler_count   INTEGER NOT NULL DEFAULT 0,
        fillers        TEXT NOT NULL DEFAULT '{}',
        transcript     TEXT NOT NULL DEFAULT '',
        audio_file     TEXT,
        created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE (session_id, round)
      );

      -- Cache dùng chung: hồ sơ từ (WordNet + Datamuse + Wiktionary), tần suất từ, từ vựng của từng video
      CREATE TABLE word_profiles (
        lemma       TEXT PRIMARY KEY,
        data        TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE TABLE word_freq (
        word        TEXT PRIMARY KEY,
        freq        REAL,
        fetched_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE TABLE ext_cache (
        key         TEXT PRIMARY KEY,
        data        TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE TABLE video_lexicon (
        video_id     TEXT PRIMARY KEY,
        track_id     TEXT NOT NULL DEFAULT '',
        token_count  INTEGER NOT NULL DEFAULT 0,
        data         TEXT NOT NULL,
        created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      -- Kế hoạch "Hôm nay học gì": video được chọn và các bước bỏ qua theo ngày
      CREATE TABLE daily_plans (
        user_id   INTEGER NOT NULL DEFAULT 0,
        day       TEXT NOT NULL,
        video_id  TEXT,
        skipped   TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY (user_id, day)
      );

      ALTER TABLE activity ADD COLUMN speaking_items INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE activity ADD COLUMN fluency_rounds INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    // Thông báo đẩy (Web Push) kể cả khi đã đóng tab, bài test ước lượng vốn từ
    id: 4,
    sql: /* sql */ `
      -- Khoá/giá trị dùng chung của ứng dụng (vd. cặp khoá VAPID tự sinh)
      CREATE TABLE app_kv (
        key    TEXT PRIMARY KEY,
        value  TEXT NOT NULL
      );

      CREATE TABLE push_subscriptions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL DEFAULT 0,
        endpoint    TEXT NOT NULL UNIQUE,
        p256dh      TEXT NOT NULL,
        auth        TEXT NOT NULL,
        user_agent  TEXT,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        last_ok_at  TEXT
      );
      CREATE INDEX idx_push_user ON push_subscriptions(user_id);

      -- Số thông báo đã gửi mỗi ngày (giới hạn tần suất)
      CREATE TABLE push_log (
        user_id  INTEGER NOT NULL DEFAULT 0,
        day      TEXT NOT NULL,
        count    INTEGER NOT NULL DEFAULT 0,
        last_at  TEXT,
        PRIMARY KEY (user_id, day)
      );

      CREATE TABLE placement_results (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL DEFAULT 0,
        level        TEXT NOT NULL,
        size         INTEGER NOT NULL DEFAULT 0,
        false_alarm  REAL NOT NULL DEFAULT 0,
        detail       TEXT NOT NULL DEFAULT '[]',
        created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX idx_placement_user ON placement_results(user_id, created_at);
    `,
  },
];

/** Các bảng có cột user_id — dùng khi chuyển dữ liệu cũ (user_id = 0) cho tài khoản đầu tiên. */
export const USER_TABLES = [
  'words',
  'review_logs',
  'activity',
  'practice_sessions',
  'video_notes',
  'user_settings',
  'user_videos',
  'phrases',
  'phrase_logs',
  'speaking_attempts',
  'fluency_sessions',
  'fluency_rounds',
  'daily_plans',
  'push_subscriptions',
  'push_log',
  'placement_results',
] as const;
