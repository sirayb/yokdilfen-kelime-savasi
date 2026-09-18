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

-- Düellolar (soru seti sabit, herkes kendi zamanında oynar)
create table if not exists duels (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references users(id) on delete cascade,
  source text not null check (source in ('all', 'opponent', 'mine')),
  question_count int not null check (question_count in (15, 30, 60)),
  time_per_question int not null check (time_per_question in (8, 12, 20)),
  direction text not null check (direction in ('tr_en', 'en_tr', 'mixed')),
  word_ids uuid[] not null,
  status text not null default 'open' check (status in ('open', 'completed')),
  created_at timestamptz not null default now()
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

create policy "allow all users" on users for all using (true) with check (true);
create policy "allow all words" on words for all using (true) with check (true);
create policy "allow all weak_words" on weak_words for all using (true) with check (true);
create policy "allow all duels" on duels for all using (true) with check (true);
create policy "allow all duel_participants" on duel_participants for all using (true) with check (true);
