# YÖKDİL Fen — Kelime Savaşı

İki kişilik, ortak kelime havuzlu ve düello modlu YÖKDİL Fen kelime çalışma uygulaması. Saf HTML/CSS/JS (build adımı yok), veri katmanı Supabase.

## Klasör yapısı

```
index.html              Sayfa iskeleti, tüm sekmeler
css/styles.css           Tema (light/dark), tüm görsel stiller
js/config.js              Supabase config sabitleri + localStorage okuma/yazma (kimlik, tema)
js/supabaseClient.js      Supabase client oluşturma
js/identity.js            Cihaz bazlı kullanıcı kimliği (auth yok)
js/api.js                 Tüm veritabanı sorguları (words, duels, leaderboard...)
js/wordUtils.js            Kelime alanı normalizasyonu (küçük harf, virgüllü eş anlam eşleşmesi)
js/app.js                 Bootstrap, sekme yönlendirme
js/modules/*.js           Her sekme için ayrı modül (home, addWord, pool, training, duel, leaderboard, connection)
supabase/schema.sql       Supabase'de çalıştırılacak tablo şeması
```

## Veri katmanı: Supabase

Neden Supabase: kelime havuzu + düello + liderlik tablosu ilişkisel veri (kullanıcılar, kelimeler, düello sonuçları arasında join/aggregate gerekiyor), bu da SQL'e NoSQL'den daha uygun. Ücretsiz planı 2 kişilik kullanım için fazlasıyla yeterli, sunucu kurmaya gerek yok.

### Kurulum adımları

1. [supabase.com](https://supabase.com) üzerinde ücretsiz hesap aç, yeni proje oluştur.
2. Proje panelinde **SQL Editor**'e git, [`supabase/schema.sql`](supabase/schema.sql) dosyasının tamamını yapıştırıp çalıştır. Bu, gerekli tabloları (`users`, `words`, `weak_words`, `duels`, `duel_participants`, `duel_answers`) ve erişim izinlerini kurar.
3. Proje panelinde **Project Settings → API** sekmesine git. `Project URL` ve `anon public` key değerlerini kopyala.

> `schema.sql` idempotent yazıldı (`if not exists` / `add column if not exists`) — proje zaten kuruluysa dosyayı tekrar SQL Editor'de çalıştırmak güvenlidir, sadece eksik kolon/tabloları ekler. Canlı düello özelliği eklendiğinde bu dosya güncellendi; mevcut bir projeyi güncellemek için dosyayı tekrar çalıştırman yeterli.

## Config: nasıl giriliyor?

Supabase URL + anon key, [`js/config.js`](js/config.js) içinde sabit değer olarak tutuluyor — kullanıcıdan istenmiyor. `anon key` herkese açık kullanılmak üzere tasarlanmıştır (erişim `RLS` politikalarıyla korunur), koda gömülü olması güvenlik açığı değildir. Gerçek gizli anahtar `service_role` key'i asla client koduna konmamalı — bu projede zaten kullanılmıyor.

İlk açılışta sadece **görünen ad** sorulur, bu da o cihazın tarayıcısında `localStorage`'da saklanır ve bir daha sorulmaz. "Bağlantı" sekmesinden bu kimlik cihazdan silinebilir (tekrar ad girmek gerekir).

Aynı ismi başka bir cihazda (örn. telefonda) da girersen yeni bir kullanıcı açılmaz — sistem `users` tablosunda aynı isimde kayıtlı biri olup olmadığına bakar, varsa o kimliği bu cihaza da bağlar. Böylece aynı kişi birden fazla cihazdan aynı hesapla (aynı istatistik/kelime geçmişiyle) girebilir. İsimler birbirinden ayırt edilsin diye iki farklı kişi aynı ismi kullanmamalı.

Kendi Supabase projeni kullanmak istersen (örn. farklı bir kopya kurarsan), `js/config.js` en üstündeki `SUPABASE_URL` ve `SUPABASE_ANON_KEY` sabitlerini kendi değerlerinle değiştirmen yeterli — build adımı yok, direkt dosyayı düzenleyip deploy edersin.

## Yerel çalıştırma

Node.js kurulu olmalı (npx için).

```bash
npm run dev
```

veya doğrudan:

```bash
npx serve . -l 3000
```

Sonra tarayıcıda `http://localhost:3000` aç. İlk açılışta sadece adını gireceksin.

## Web'de yayınlama (her yerden erişim için)

1. Bu klasörü bir GitHub reposuna push et.
2. [Vercel](https://vercel.com) veya [Netlify](https://netlify.com) üzerinde ücretsiz hesap aç, repoyu bağla. Build ayarı gerekmiyor (statik site) — "framework preset: Other / static" seç, build command boş bırakılabilir.
3. Deploy sonrası verilen sabit link (örn. `yokdilfen.vercel.app`) her iki arkadaşta da açılır. Her push'ta otomatik güncellenir.
4. Arkadaşın da aynı linki açtığında kendi cihazında ilk kurulum ekranını görür — sadece kendi adını yazar. Supabase bağlantısı koda gömülü olduğu için ekstra bilgi girmesi gerekmez. Böylece ikiniz aynı ortak havuza bağlanmış olursunuz.

## Oyun mekaniği notları

### Canlı (senkron) düello

Düelloyu oluşturan "bekleme odası"na girer (`duels.live_status='waiting'`). Rakip Savaş sekmesinde "Katılabileceğin Canlı Düellolar" listesinden katılınca (`live_status='active'`, ortak bir `current_question_started_at` zaman damgası) ikisi de aynı anda aynı soruyu görür. Her cevap sunucu zaman damgasıyla `duel_answers` tablosuna yazılır (Supabase Realtime ile karşı tarafa anında yansır). Her sorunun sabit bir süresi vardır (8/12/20sn); **biri doğru cevaplar cevaplamaz o an soru herkes için ilerler** (rakip cevap veremeden geçilir, bu yüzden ceza almaz) — kimse doğru bilemezse tam süre dolunca ilerler. Sayfa yenilenirse (`current_question_index`, geçmiş `duel_answers` satırları üzerinden) kaldığı yerden devam eder.

"Karma" yönde her sorunun TR→EN mi EN→TR mi olacağı soru sırasına göre deterministiktir (index çift/tek), böylece iki oyuncu da aynı soruyu aynı yönde görür.

Uygulama başta hem "kendi zamanında" hem "canlı" iki ayrı düello modu ile kuruldu, ama "kendi zamanında" mod kullanışsız bulunup kaldırıldı — artık tek mod var: canlı.

### Puan

HP/eleme yok, düz puan sistemi: doğru cevap **+15**, aktif olarak yanlış cevap gönderme **-5**, süre dolup hiç cevap verilmezse (ne kendisi ne rakip bilemezse) **0** puan, ceza yok. Hız bonusu ya da seri çarpanı uygulanmaz; "en uzun seri" istatistiği yine de ayrıca tutulur.

### Liderlik tablosu

Tamamlanmış düello katılımları (`duel_participants`) üzerinden kullanıcı bazında toplanır: toplam puan (asıl sıralama kriteri), **kazanılan düello sayısı** (bir düello bitince skoru yüksek olan `duels.winner_id` olarak yazılır, eşitlikte kimse kazanmaz — eşit toplam puanda ikinci sıralama kriteri), doğru/yanlış toplamı, en uzun seri maksimumu, maç sayısı.

### Diğer

- **Kelime silme**: Kelime Havuzu'nda sadece kendi eklediğin kelimeleri silebilirsin (arkadaşının eklediklerine dokunamazsın), onay istenir.
- **Birden fazla anlam**: İngilizce terim veya Türkçe anlam alanına virgülle ayırarak birden fazla karşılık yazabilirsin (örn. `kötüleşmek, bozulmak`). Düelloda bunlardan sadece birini doğru yazmak yeterlidir. Kelime/anlam alanları kaydedilirken otomatik küçük harfe çevrilir (örnek cümle etkilenmez), böylece büyük/küçük harf farkı eşleşmeyi bozmaz.
