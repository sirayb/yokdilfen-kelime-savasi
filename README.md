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
js/app.js                 Bootstrap, sekme yönlendirme
js/modules/*.js           Her sekme için ayrı modül (home, addWord, pool, training, duel, leaderboard, connection)
supabase/schema.sql       Supabase'de çalıştırılacak tablo şeması
```

## Veri katmanı: Supabase

Neden Supabase: kelime havuzu + düello + liderlik tablosu ilişkisel veri (kullanıcılar, kelimeler, düello sonuçları arasında join/aggregate gerekiyor), bu da SQL'e NoSQL'den daha uygun. Ücretsiz planı 2 kişilik kullanım için fazlasıyla yeterli, sunucu kurmaya gerek yok.

### Kurulum adımları

1. [supabase.com](https://supabase.com) üzerinde ücretsiz hesap aç, yeni proje oluştur.
2. Proje panelinde **SQL Editor**'e git, [`supabase/schema.sql`](supabase/schema.sql) dosyasının tamamını yapıştırıp çalıştır. Bu, gerekli tabloları (`users`, `words`, `weak_words`, `duels`, `duel_participants`) ve erişim izinlerini kurar.
3. Proje panelinde **Project Settings → API** sekmesine git. `Project URL` ve `anon public` key değerlerini kopyala.

## Config: nasıl giriliyor?

Supabase URL + anon key, [`js/config.js`](js/config.js) içinde sabit değer olarak tutuluyor — kullanıcıdan istenmiyor. `anon key` herkese açık kullanılmak üzere tasarlanmıştır (erişim `RLS` politikalarıyla korunur), koda gömülü olması güvenlik açığı değildir. Gerçek gizli anahtar `service_role` key'i asla client koduna konmamalı — bu projede zaten kullanılmıyor.

İlk açılışta sadece **görünen ad** sorulur, bu da o cihazın tarayıcısında `localStorage`'da saklanır ve bir daha sorulmaz. "Bağlantı" sekmesinden bu kimlik cihazdan silinebilir (tekrar ad girmek gerekir).

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

- **Düello seti sabit**: Düello oluşturulduğunda seçilen kelimeler (`word_ids`) veritabanına kaydedilir, her iki oyuncu da aynı seti kendi zamanında oynar. "Karma" yönde her sorunun TR→EN mi EN→TR mi olacağı soru sırasına göre deterministiktir (index çift/tek), böylece iki oyuncu da aynı soruyu aynı yönde görür.
- **Puan**: doğru cevapta taban puan + kalan süre oranına göre hız bonusu, bu ikisinin toplamı seri çarpanı (her 3 doğruda +0.5x) ile çarpılır.
- **HP**: yanlış/süre dolumunda -25 HP, 0'da düello o oyuncu için biter (eleme), o ana kadarki skor kaydedilir.
- **Liderlik tablosu**: tamamlanmış tüm düello katılımları (`duel_participants`) üzerinden kullanıcı bazında toplanır (skor toplamı, doğru/yanlış toplamı, en uzun seri maksimumu, maç sayısı).
- **Kelime silme**: Kelime Havuzu'nda sadece kendi eklediğin kelimeleri silebilirsin (arkadaşının eklediklerine dokunamazsın), onay istenir.
