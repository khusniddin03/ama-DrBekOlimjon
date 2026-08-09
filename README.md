# Savol-javob

`question-asnwer.json` dagi savol-javoblarni ko'rsatadigan statik sayt. Yuqorisida
jonli qidiruv, qorong'i va yorug' rejim. Ranglar Telegram'ning standart
mavzularidan olingan.

Freymvork yo'q, build yo'q, `npm install` yo'q, Python yo'q — uchta fayl:

```
index.html    styles.css    app.js    question-asnwer.json
```

Tashqi tarmoqqa bitta ham so'rov yubormaydi: shrift ham, ikonka ham, kutubxona
ham yuklanmaydi.

## Joylashtirish

Papkani o'zgarishsiz Netlify yoki Vercelga tashlang — build buyrug'i kerak emas,
publish papkasi shu papkaning o'zi. Sayt JSON faylni to'g'ridan-to'g'ri o'qiydi,
shuning uchun **JSON ni yangilab qayta joylasangiz, sayt ham yangilanadi**.

## Lokal ishga tushirish

```bash
npx serve
# yoki
python3 -m http.server 8000
```

`index.html` ni shunchaki ikki marta bosib ochish ishlamaydi: brauzer `file://`
da JSON o'qishga ruxsat bermaydi. Sahifa bu holatda buni tushuntiruvchi xabar
ko'rsatadi.

## Ma'lumot qo'shish

`question-asnwer.json` — yagona manba:

```json
[{ "question": "…", "answer": "…" }]
```

Massiv oxiriga yangi obyekt qo'shing, tamom. Sahifadagi barcha sonlar — savollar
soni, o'qish vaqti, yon ro'yxat — fayldan hisoblanadi, hech qayerda qo'lda
yozilmagan.

Matn ichidagi `\n` muhim: bo'sh qator — yangi xatboshi, `1.` bilan boshlangan
qatorlar — raqamli ro'yxat.

## Qidiruv

Savol ham, javob ham qidiriladi. Uch bosqich, har biri oldingisi hech narsa
topmagandagina ishga tushadi:

1. **Aniq moslik.** Apostrof umuman hisobga olinmaydi — `o'rganish`,
   `oʻrganish` va `organish` bir xil natija beradi.
2. **x ↔ h.** `hato` yozsangiz `xato` topiladi.
3. **Probelsiz.** `homeschooling` yozsangiz `home schooling` topiladi.

2- va 3-bosqichda status qatori "Aniq moslik topilmadi. Yaqin natijalar" deb
ogohlantiradi.

Bir nechta so'z yozilsa hammasi topilishi shart, tartibi ahamiyatsiz. Faqat
raqamdan iborat so'rov butun so'z sifatida qidiriladi — `10` so'rovi `100%`
ichidagi `10` ni topmaydi.

Tugmalar: `/` yoki `Cmd/Ctrl+K` — qidiruv, `Esc` — tozalash, `↓ ↑ Home End` —
savollar orasida yurish.

## Yuklab olish

Qidiruv yonidagi dumaloq tugma to'rt formatni beradi:

| Format | Nima bo'ladi |
|---|---|
| **Word** | `.docx` fayl yuklanadi — Word, Pages, Google Docs da ochiladi |
| **PDF** | brauzerning chop etish oynasi ochiladi, u yerda "PDF sifatida saqlash" |
| **Excel** | `.xlsx` fayl — uch ustun: `#`, `Savol`, `Javob` |
| **JSON** | manba formatining o'zi |

Qidiruv faol bo'lsa **faqat topilgan savollar** yuklanadi va so'rov fayl nomiga
qo'shiladi: `savol-javob-germaniya.docx`.

Hech qanday kutubxona ishlatilmaydi — `.docx` va `.xlsx` brauzerning o'zida
yasaladi.
# ama-DrBekOlimjon
