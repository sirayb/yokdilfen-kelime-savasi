-- YÖKDİL Fen Kelime Savaşı — Supabase şeması
-- Supabase Dashboard > SQL Editor içinde bu dosyanın tamamını çalıştır.

create extension if not exists pgcrypto;

-- Kullanıcılar (cihaz bazlı kimlik, auth yok — sadece 2 arkadaş için)
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  created_at timestamptz not null default now()
);

-- Ortak kelime havuzu
create table if not exists words (
  id uuid primary key default gen_random_uuid(),
  en text not null,
  tr text not null,
  example text,
  added_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Zayıf kelime işaretlemeleri (kullanıcı başına)
create table if not exists weak_words (
  user_id uuid not null references users(id) on delete cascade,
  word_id uuid not null references words(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, word_id)
);

-- Düellolar. mode='async': soru seti sabit, herkes kendi zamanında oynar.
-- mode='live': iki taraf aynı anda, senkron soru akışıyla oynar.
create table if not exists duels (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references users(id) on delete cascade,
  source text not null check (source in ('all', 'opponent', 'mine')),
  question_count int not null check (question_count in (15, 30, 60)),
  time_per_question int not null check (time_per_question in (8, 12, 20)),
  direction text not null check (direction in ('tr_en', 'en_tr', 'mixed')),
  word_ids uuid[] not null,
  status text not null default 'open' check (status in ('open', 'completed')),
  created_at timestamptz not null default now(),
  mode text not null default 'async' check (mode in ('async', 'live')),
  live_status text check (live_status in ('waiting', 'active', 'finished')),
  joined_by uuid references users(id) on delete cascade,
  current_question_index int not null default 0,
  current_question_started_at timestamptz,
  winner_id uuid references users(id)
);

alter table duels add column if not exists mode text not null default 'async' check (mode in ('async', 'live'));
alter table duels add column if not exists live_status text check (live_status in ('waiting', 'active', 'finished'));
alter table duels add column if not exists joined_by uuid references users(id) on delete cascade;
alter table duels add column if not exists current_question_index int not null default 0;
alter table duels add column if not exists current_question_started_at timestamptz;
alter table duels add column if not exists winner_id uuid references users(id);

-- Canlı düello cevapları — kim önce/doğru cevapladı sunucu zaman damgasıyla belirlenir,
-- *_after kolonları o an sonrası kümülatif değerleri taşır (client tekrar hesaplamasın diye).
create table if not exists duel_answers (
  duel_id uuid not null references duels(id) on delete cascade,
  question_index int not null,
  user_id uuid not null references users(id) on delete cascade,
  correct boolean not null,
  score_after int not null,
  hp_after int not null,
  streak_after int not null,
  answered_at timestamptz not null default now(),
  primary key (duel_id, question_index, user_id)
);

-- Düello katılım sonuçları (kullanıcı başına bir satır)
create table if not exists duel_participants (
  duel_id uuid not null references duels(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  score int not null default 0,
  hp int not null default 100,
  correct int not null default 0,
  wrong int not null default 0,
  longest_streak int not null default 0,
  eliminated boolean not null default false,
  answers jsonb not null default '[]',
  finished_at timestamptz,
  primary key (duel_id, user_id)
);

-- RLS: sadece 2 arkadaş arasında paylaşılan, kimlik doğrulamasız küçük uygulama.
-- anon key ile tam erişim açık bırakılıyor. Public'e link paylaşılmamalı.
alter table users enable row level security;
alter table words enable row level security;
alter table weak_words enable row level security;
alter table duels enable row level security;
alter table duel_participants enable row level security;
alter table duel_answers enable row level security;

drop policy if exists "allow all users" on users;
drop policy if exists "allow all words" on words;
drop policy if exists "allow all weak_words" on weak_words;
drop policy if exists "allow all duels" on duels;
drop policy if exists "allow all duel_participants" on duel_participants;
drop policy if exists "allow all duel_answers" on duel_answers;

create policy "allow all users" on users for all using (true) with check (true);
create policy "allow all words" on words for all using (true) with check (true);
create policy "allow all weak_words" on weak_words for all using (true) with check (true);
create policy "allow all duels" on duels for all using (true) with check (true);
create policy "allow all duel_participants" on duel_participants for all using (true) with check (true);
create policy "allow all duel_answers" on duel_answers for all using (true) with check (true);

-- Canlı düello için gerçek zamanlı değişiklik akışı (Realtime) aç.
do $$
begin
  alter publication supabase_realtime add table duels;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table duel_answers;
exception when duplicate_object then null;
end $$;
