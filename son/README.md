# Lista — Lista DareG wersja 1.0v

Zaawansowana aplikacja PWA typu „checklista / zadania / zakupy” z integracją paragonów (OCR), przepisów i systemu wakacji. Mobile‑first (Android), kompatybilna z iOS i Web. Offline‑first z pełnym CRUD oraz synchronizacją przez Supabase (Auth, Postgres, Realtime). Ikony interfejsu zrealizowane wyłącznie w PURE CSS.

- Język interfejsu: polski
- Technologie: HTML5, CSS3, JavaScript (bez frameworków UI), Supabase
- Tryby pracy: gość (localStorage) i zalogowany (Supabase + cache offline)
- Powiadomienia: granularne per sekcja, ciche godziny, działanie offline

---

## 1) Struktura projektu

- index.html — główny plik aplikacji PWA
- css/
  - style.css — podstawy, layout, komponenty bazowe
  - components.css — komponenty + IKONY PURE CSS
  - animations.css — animacje i przejścia
  - themes.css — motywy, akcenty, kontrasty
- js/
  - app.js — główna logika UI, nawigacja, PWA, integracja modułów
  - storage.js — localStorage, kolejka offline, migracje, sync z Supabase, RLS
  - ui.js — zachowania interfejsu (ripple, drawer, motywy, skróty)
  - swipe-handler.js — gesty swipe i arkusz akcji
  - archive.js — Archiwum i Kosz (Ostatnio usunięte)
  - settings.js — Motywy i Wygląd (persistencja)
  - barcode-scanner.js — skanowanie kodów (BarcodeDetector, fallback ręczny)
  - statistics.js — statystyki i raporty (Canvas)
  - loyalty-cards.js — karty lojalnościowe (kod EAN‑13/Code128 na Canvas)
  - list-manager.js — zarządzanie listami/projektami i kolorami
  - auth.js — logowanie Google / e‑mail, reset, zmiany hasła/e‑maila
  - supabase-client.js — klient Supabase (Auth, push/pull, Realtime)
  - sharing.js — udostępnianie list, zaproszenia, kanały Realtime
  - receipts.js — paragony, OCR (Tesseract.js wczytywany leniwie)
  - recipes.js — system przepisów (+ integracja z zakupami)
  - vacations.js — system wakacyjny (+ integracje)
  - notifications.js — powiadomienia i przypomnienia
  - important-dates.js — „Ważne daty”, przypomnienia, integracja z Zadaniami
  - calendar.js — widok kalendarza (miesięczny/tygodniowy)
  - profile.js — sekcja „Profil”
- README.md — niniejszy dokument
- (PWA) manifest.webmanifest — manifest aplikacji (27/28)
- (PWA) sw.js — service worker (28/28)

Uwaga: Ikony interfejsu są wyłącznie w PURE CSS (components.css). Manifest PWA może wymagać plików ikon PNG dla ekranu instalacji; nie są one używane w UI.

---

## 2) Konfiguracja Supabase

- Project URL: https://vzttszvasssweigpqwcc.supabase.co
- Anon API Key (klient): (zapisany w js/supabase-client.js)

Wersja demonstracyjna używa klucza anon w przeglądarce (standard dla Supabase). Dane wrażliwe (service role) nie są używane po stronie klienta.

### 2.1) Tabele (proponowana definicja)

Przykładowy zestaw tabel w schemacie public (Postgres). Wymagane kolumny: id (uuid), user_id (uuid), updated_at (timestamptz) + domenowe. Zależnie od potrzeb można rozszerzać. Typy jsonb wykorzystujemy do elastycznych struktur.

```sql
-- Wymagane rozszerzenie UUID (jeśli jeszcze nie)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Checklista
create table if not exists checklist_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id uuid not null references checklist_lists(id) on delete cascade,
  title text not null,
  done boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

-- Zadania
create table if not exists task_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  color text,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  project_id uuid not null references task_projects(id) on delete cascade,
  title text not null,
  notes text,
  priority text,           -- 'low' | 'medium' | 'high'
  due timestamptz,         -- termin (opcjonalnie)
  category text,
  done boolean default false,
  subtasks jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

-- Zakupy
create table if not exists shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  color text,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

create table if not exists shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  list_id uuid not null references shopping_lists(id) on delete cascade,
  name text not null,
  qty numeric,
  category text,
  store text,
  cost numeric,
  bought boolean default false,
  oos boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

-- Karty lojalnościowe
create table if not exists loyalty_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  code text not null,
  store text,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

-- Paragony
create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  store text,
  date date,
  total numeric,
  tags text,
  ocr_text text,
  image_url text,          -- opcjonalnie (gdy użyjemy Storage Buckets)
  created_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

-- Ważne daty
create table if not exists dates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  title text not null,
  date date not null,
  category text,
  notes text,
  remind boolean default false,
  remind_offset_days int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

-- Archiwum i Kosz
create table if not exists archive (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  type text not null,      -- np. 'checklist_lists', 'task_projects', ...
  ref_id uuid,
  data jsonb,
  archived_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trash (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  type text not null,
  ref_id uuid,
  data jsonb,
  deleted_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

-- Przepisy (obsługiwane własnym modułem recipes.js)
create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  title text not null,
  description text,
  category text,
  time_min int,
  difficulty text,         -- 'easy' | 'medium' | 'hard'
  servings int,
  ingredients jsonb default '[]'::jsonb,
  steps jsonb default '[]'::jsonb,
  photos jsonb default '[]'::jsonb,
  notes text,
  nutrition jsonb,
  favorite boolean default false,
  history jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

-- Wakacje (obsługiwane własnym modułem vacations.js)
create table if not exists vacations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  start_date date,
  end_date date,
  destination jsonb,
  packing jsonb default '[]'::jsonb,
  schedule jsonb default '[]'::jsonb,
  budget jsonb,            -- {currency, items:[{category,planned,actual,note}]}
  weather jsonb,
  places jsonb default '[]'::jsonb,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

-- Udostępnianie (sharing.js)
create table if not exists shared_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  section text not null,   -- 'checklist' | 'tasks' | 'shopping'
  list_id uuid not null,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

create table if not exists shared_members (
  id uuid primary key default gen_random_uuid(),
  shared_id uuid not null references shared_lists(id) on delete cascade,
  member_email text not null,
  member_user_id uuid,
  permission text not null default 'edit', -- 'read' | 'edit'
  status text not null default 'invited',  -- 'invited' | 'active' | 'revoked'
  created_at timestamptz default now(),
  updated_at timestamptz not null default now()
);