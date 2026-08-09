/* =============================================================================
   Savol-javob — arxivni chizish, qidirish va belgilash.

   Klassik <script>, modul emas: file:// da ES modullar bloklanadi.
   ========================================================================== */
(function () {
  'use strict';

  /* --------------------------------------------------------------- doim -- */

  var CLAMP_LINES = 8;         // savol nechta qatordan keyin qisqartiriladi
  var MAX_MARKS = 40;          // bitta yozuvdagi belgilar chegarasi
  var MIN_MARK_LEN = 2;        // 1 harfli so'rov filtrlaydi, lekin belgilamaydi
  var SQUISH_MIN = 6;          // probel-siz qidiruv shundan qisqa so'rovda ishlamaydi
  var STATUS_DELAY = 350;      // ekran o'qigichga e'lon qilish kechikishi

  var CHIPS = ['Germaniya', 'USMLE', 'oftalmolog', 'aksiya', 'home schooling', 'farzand', 'sport'];

  /* ------------------------------------------------------- normalizatsiya --

     DIQQAT: bu faqat QIDIRUV indeksi uchun. Ekranga chiqadigan matnga hech
     qachon qo'llanmaydi. O'zbek lotinida o' va g' — harflar, tinish belgisi
     emas. Chizish yo'li doim rec.question / rec.answer dan o'qiydi.

     Apostroflar O'CHIRILADI (bitta belgiga keltirilmaydi): korpusning o'zi
     nomuvofiq — "bo'yicha" ham, "boyicha" ham uchraydi. O'chirish ikkala
     yozuvni bitta kalitga tushiradi, shuning uchun apostrofsiz yozgan odam
     ham topadi.
  -------------------------------------------------------------------------- */

  var APOS = /['‘’ʻʼʹ′‵´`‛＇]/;
  var ALNUM = /[\p{L}\p{N}]/u;

  /* Bir yurishda normallashgan satr + har bir belgining manba indeksini
     qaytaradi. Xarita shart: normalizatsiya belgilarni o'chiradi, shuning
     uchun mos kelgan joyni asl matnga qaytarish uchun boshqa yo'l yo'q. */
  function normMap(src) {
    var out = [];
    var idx = [];
    var pending = false;
    for (var i = 0; i < src.length; i++) {
      var ch = src.charAt(i);
      if (APOS.test(ch)) continue;
      if (ALNUM.test(ch)) {
        if (pending && out.length) { out.push(' '); idx.push(i); }
        pending = false;
        var low = ch.toLowerCase();
        for (var k = 0; k < low.length; k++) { out.push(low.charAt(k)); idx.push(i); }
      } else {
        pending = true;
      }
    }
    return { norm: out.join(''), map: idx };
  }

  function normalize(s) { return normMap(String(s)).norm; }

  /* ------------------------------------------------------------ yordamchi -- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.appendChild(document.createTextNode(text));
    return n;
  }

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }

  function reduceMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ------------------------------------------------------------- parser --

     Savol va javob uchun bitta parser. 6, 11, 14-yozuvlarning SAVOLIDA ham
     raqamli ro'yxat bor, shuning uchun faqat javobga qo'llash xato bo'lardi.
  -------------------------------------------------------------------------- */

  /* {1,2} chegara, majburiy [.)] va (\s+|$) — uchalasi ham zarur:
     [.)] bo'lmasa "2018 yakuni edi." ro'yxatga aylanadi;
     {1,4} bo'lsa "2018" marker sifatida o'qiladi;
     |$ esa yolg'iz turgan "3." qatorini tutadi. */
  var LIST_RE = /^\s*(\d{1,2})[.)](\s+|$)/;
  var LEDE_RE = /^([^.?!:\n]{1,28}):\s/;
  var GREET_RE = /^(as+al[ao]mu?\s*a?l[ae]y?ku?m|salom|hurmatli)$/;
  var HASHTAG_RE = /^#[^\s#]+$/;

  function isGreetingLine(line) {
    var t = line.trim();
    if (!t.length || t.length > 42) return false;
    return GREET_RE.test(normalize(t));
  }

  /* raw -> DocumentFragment. Hech qayerda innerHTML ishlatilmaydi:
     muallif matni DOMga faqat createTextNode orqali kiradi. */
  function parseField(raw, opts) {
    opts = opts || {};
    var frag = document.createDocumentFragment();
    var lines = String(raw).split('\n');

    var paraBuf = [];
    var list = null;          // joriy <ol>
    var curLi = null;
    var gapFlag = false;
    var looseFlags = [];

    function flushPara() {
      if (!paraBuf.length) return;
      var p = document.createElement('p');
      for (var i = 0; i < paraBuf.length; i++) {
        if (i) p.appendChild(document.createElement('br'));
        p.appendChild(document.createTextNode(paraBuf[i]));
      }
      frag.appendChild(p);
      paraBuf = [];
    }

    function closeList() {
      if (!list) return;
      // Bo'sh oraliqli element bo'lsa — keng ro'yxat, aks holda zich.
      var loose = false;
      for (var i = 1; i < looseFlags.length; i++) if (looseFlags[i]) loose = true;
      list.className = 'qa-list ' + (loose ? 'is-loose' : 'is-tight');
      frag.appendChild(list);
      list = null; curLi = null; looseFlags = []; gapFlag = false;
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      if (!line.trim()) {
        if (list) gapFlag = true;
        else flushPara();
        continue;
      }

      var m = LIST_RE.exec(line);
      if (m) {
        if (!list) {
          flushPara();
          list = document.createElement('ol');
          list.className = 'qa-list is-tight';
        }
        curLi = document.createElement('li');
        curLi.setAttribute('value', m[1]);
        var marker = el('span', 'n', m[1] + '.');
        marker.setAttribute('data-nomark', '');
        marker.setAttribute('aria-hidden', 'true');
        curLi.appendChild(marker);
        var rest = line.slice(m[0].length);
        if (rest) curLi.appendChild(document.createTextNode(rest));
        list.appendChild(curLi);
        looseFlags.push(gapFlag);
        gapFlag = false;
        continue;
      }

      if (list) {
        if (gapFlag) {
          closeList();
          paraBuf.push(line);
        } else if (curLi) {
          curLi.appendChild(document.createElement('br'));
          curLi.appendChild(document.createTextNode(line));
        }
        continue;
      }

      // Savolda salomlashish qatori — alohida, kichik ko'rinishda.
      if (opts.demoteGreeting && !paraBuf.length && frag.childNodes.length === 0 && isGreetingLine(line)) {
        var sal = el('p', 'salutation', line.trim());
        frag.appendChild(sal);
        continue;
      }

      paraBuf.push(line);
    }
    closeList();
    flushPara();

    // Yolg'iz turgan marker ("3.") keyingi paragrafni o'ziga oladi.
    var lis = frag.querySelectorAll('li');
    for (var j = 0; j < lis.length; j++) {
      var li = lis[j];
      var txt = li.textContent.replace(/^\s*\d{1,2}\.\s*/, '').trim();
      if (txt) continue;
      var host = li.closest('ol');
      var next = host && host.nextSibling;
      if (next && next.nodeType === 1 && next.tagName === 'P') {
        while (next.firstChild) li.appendChild(next.firstChild);
        next.parentNode.removeChild(next);
      }
    }

    // Lede: muallif yozgan "Sarlavha: matn" ni sans-da qalinlashtiramiz.
    if (opts.lede) {
      var ps = frag.childNodes;
      for (var k = 0; k < ps.length; k++) {
        var node = ps[k];
        if (node.nodeType !== 1 || node.tagName !== 'P') continue;
        var first = node.firstChild;
        if (!first || first.nodeType !== 3) continue;
        var mm = LEDE_RE.exec(first.data);
        if (!mm) continue;
        if (first.data.length <= mm[0].length && !first.nextSibling) continue;
        var b = el('b', 'lede', mm[1] + ':');
        first.data = first.data.slice(mm[1].length + 1);
        node.insertBefore(b, first);
      }
    }

    return frag;
  }

  /* Qator boshidagi salomlashishni kesadi: "Assalomu alaykum. Yaxshimisiz
     Bek aka?" -> "Yaxshimisiz Bek aka?". Faqat yetakchi qator uchun, ya'ni
     yon ro'yxat va ekran o'qigich nomi uchun — ko'rinadigan matn hech qachon
     o'zgarmaydi. */
  var GREET_PREFIX = /^\s*(as+al[ao]mu?\s*a?l[ae]y?ku?m|salom)\b[\s.,!:;)\-–—]*/i;

  function stripGreetingPrefix(line) {
    var m = GREET_PREFIX.exec(line);
    if (!m) return line;
    var rest = line.slice(m[0].length).trim();
    return rest || line;
  }

  /* Sarlavha o'rnida ishlatiladigan "yetakchi qator": salomlashish ham,
     yolg'iz hashtag ham bo'lmagan birinchi qator. Faqat ekran o'qigich uchun
     va yon ro'yxat uchun — hech qachon ko'rinadigan matnga aylanmaydi. */
  function leadLine(question) {
    var lines = String(question).split('\n');
    var longest = '';
    var weak = '';
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t) continue;
      if (t.length > longest.length) longest = t;
      if (isGreetingLine(t)) continue;
      if (HASHTAG_RE.test(t)) continue;
      var lead = stripGreetingPrefix(t);
      // "Asalomu alaykum yahshimisiz." dan keyin "yahshimisiz." qoladi —
      // bu ro'yxatda hech narsa demaydi, shuning uchun keyingi qatorga o'tamiz.
      if (lead.length < 15) { if (!weak) weak = lead; continue; }
      return lead;
    }
    return weak || stripGreetingPrefix(longest);
  }

  function truncate(s, n) {
    return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s;
  }

  /* ---------------------------------------------------------------- data -- */

  var records = [];
  var slugs = {};

  function makeSlug(question) {
    var base = normalize(question).split(' ').slice(0, 6).join('-').slice(0, 48) || 'savol';
    var slug = 's-' + base;
    if (slugs[slug]) {
      var n = 2;
      while (slugs[slug + '-' + n]) n++;
      slug = slug + '-' + n;
    }
    slugs[slug] = true;
    return slug;
  }

  function buildRecords(raw) {
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      if (!r || typeof r.question !== 'string' || typeof r.answer !== 'string') continue;
      var q = r.question.normalize('NFC');
      var a = r.answer.normalize('NFC');
      var strict = normalize(q) + ' ' + normalize(a);
      out.push({
        question: q,
        answer: a,
        lead: leadLine(q),
        slug: makeSlug(q),
        strict: strict,
        loose: strict.replace(/x/g, 'h'),
        squish: strict.replace(/ /g, '')
      });
    }
    return out;
  }

  /* -------------------------------------------------------------- qidiruv -- */

  function tokenize(query) {
    var n = normalize(query);
    return n ? n.split(' ') : [];
  }

  function isNumeric(tok) { return /^\p{Nd}+$/u.test(tok); }

  function hasWholeWord(hay, tok) {
    var i = hay.indexOf(tok);
    while (i !== -1) {
      var before = i === 0 || hay.charAt(i - 1) === ' ';
      var after = i + tok.length === hay.length || hay.charAt(i + tok.length) === ' ';
      if (before && after) return true;
      i = hay.indexOf(tok, i + 1);
    }
    return false;
  }

  function matches(hay, tokens) {
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (isNumeric(t)) { if (!hasWholeWord(hay, t)) return false; }
      else if (hay.indexOf(t) === -1) return false;
    }
    return true;
  }

  /* Uch pog'ona: aniq -> x/h almashinuvi -> probelsiz. Har biri faqat
     oldingisi 0 natija bergandagina ishga tushadi, shuning uchun aniqlik
     hech qachon pasaymaydi. */
  function runSearch(query) {
    var tokens = tokenize(query);
    if (!tokens.length) return { tier: 0, hits: null, tokens: [] };

    var hits = [];
    var i;
    for (i = 0; i < records.length; i++) if (matches(records[i].strict, tokens)) hits.push(i);
    if (hits.length) return { tier: 1, hits: hits, tokens: tokens };

    var loose = tokens.map(function (t) { return t.replace(/x/g, 'h'); });
    for (i = 0; i < records.length; i++) if (matches(records[i].loose, loose)) hits.push(i);
    if (hits.length) return { tier: 2, hits: hits, tokens: loose };

    var squished = tokens.join('');
    if (squished.length >= SQUISH_MIN) {
      for (i = 0; i < records.length; i++) {
        if (records[i].squish.indexOf(squished) !== -1) hits.push(i);
      }
      if (hits.length) return { tier: 3, hits: hits, tokens: [] };
    }

    return { tier: 1, hits: [], tokens: tokens };
  }

  /* ------------------------------------------------------------ belgilash -- */

  function clearMarks(root) {
    var marks = root.querySelectorAll('mark');
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      m.parentNode.replaceChild(document.createTextNode(m.textContent), m);
    }
    root.normalize();
  }

  function rangesIn(text, tokens, tier) {
    var nm = normMap(text);
    var hay = tier === 2 ? nm.norm.replace(/x/g, 'h') : nm.norm;
    var ranges = [];
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      if (tok.length < MIN_MARK_LEN) continue;
      var numeric = isNumeric(tok);
      var at = hay.indexOf(tok);
      while (at !== -1) {
        var ok = true;
        if (numeric) {
          var before = at === 0 || hay.charAt(at - 1) === ' ';
          var after = at + tok.length === hay.length || hay.charAt(at + tok.length) === ' ';
          ok = before && after;
        }
        if (ok) ranges.push([nm.map[at], nm.map[at + tok.length - 1] + 1]);
        at = hay.indexOf(tok, at + 1);
      }
    }
    if (ranges.length < 2) return ranges;
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [ranges[0]];
    for (var j = 1; j < ranges.length; j++) {
      var last = merged[merged.length - 1];
      if (ranges[j][0] <= last[1]) last[1] = Math.max(last[1], ranges[j][1]);
      else merged.push(ranges[j]);
    }
    return merged;
  }

  function applyMarks(root, tokens, tier, budget) {
    if (!tokens.length || budget <= 0) return 0;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.data.trim()) return NodeFilter.FILTER_REJECT;
        var p = node.parentNode;
        while (p && p !== root) {
          if (p.nodeType === 1 && p.hasAttribute('data-nomark')) return NodeFilter.FILTER_REJECT;
          p = p.parentNode;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    var n;
    while ((n = walker.nextNode())) nodes.push(n);

    var used = 0;
    for (var i = 0; i < nodes.length && used < budget; i++) {
      var node = nodes[i];
      var ranges = rangesIn(node.data, tokens, tier);
      if (!ranges.length) continue;
      var frag = document.createDocumentFragment();
      var pos = 0;
      for (var r = 0; r < ranges.length && used < budget; r++) {
        var s = ranges[r][0], e = ranges[r][1];
        if (s > pos) frag.appendChild(document.createTextNode(node.data.slice(pos, s)));
        var mk = document.createElement('mark');
        mk.appendChild(document.createTextNode(node.data.slice(s, e)));
        frag.appendChild(mk);
        pos = e;
        used++;
      }
      if (pos < node.data.length) frag.appendChild(document.createTextNode(node.data.slice(pos)));
      node.parentNode.replaceChild(frag, node);
    }
    return used;
  }

  /* --------------------------------------------------------------- chizish -- */

  var entries = [];   // { li, article, qProse, qBlock, answer, clampBtn, railLink, rec }

  function buildEntry(rec, index, total) {
    var li = document.createElement('li');
    li.style.setProperty('--i', String(index));

    var art = el('article', 'qa');
    art.id = rec.slug;

    var ordText = pad(index + 1, String(total).length < 2 ? 2 : String(total).length);

    var kicker = el('h2', 'kicker');
    kicker.setAttribute('aria-label', 'Savol ' + ordText + ': ' + truncate(rec.lead, 70));
    var ord = el('span', 'ord', ordText);
    ord.setAttribute('data-nomark', '');
    kicker.appendChild(ord);
    var sep = el('span', 'ord-sep', '·');
    sep.setAttribute('data-nomark', '');
    kicker.appendChild(sep);

    var firstLine = rec.question.split('\n')[0].trim();
    var hashtag = HASHTAG_RE.test(firstLine) ? firstLine : null;
    if (hashtag) {
      var h = el('span', 'hash', hashtag);
      h.setAttribute('data-nomark', '');
      kicker.appendChild(h);
      var sep2 = el('span', 'ord-sep', '·');
      sep2.setAttribute('data-nomark', '');
      kicker.appendChild(sep2);
    }
    var savolLabel = el('span', null, 'SAVOL');
    savolLabel.setAttribute('data-nomark', '');
    kicker.appendChild(savolLabel);
    art.appendChild(kicker);

    var qBody = hashtag
      ? rec.question.split('\n').slice(1).join('\n').replace(/^\n+/, '')
      : rec.question;

    var qBlock = el('div', 'q-block');
    var qProse = el('div', 'q-prose');
    qProse.id = rec.slug + '-q';
    qProse.appendChild(parseField(qBody, { demoteGreeting: true }));
    qBlock.appendChild(qProse);
    art.appendChild(qBlock);

    var clampBtn = el('button', 'clampbtn');
    clampBtn.type = 'button';
    clampBtn.hidden = true;
    clampBtn.setAttribute('aria-expanded', 'false');
    clampBtn.setAttribute('aria-controls', qProse.id);
    var btnText = el('span', null, "To'liq savolni ko'rish");
    clampBtn.appendChild(btnText);
    clampBtn.insertAdjacentHTML('beforeend',
      '<svg width="10" height="10" viewBox="0 0 10 6" fill="none" aria-hidden="true" focusable="false">' +
      '<polyline points="1,1 5,5 9,1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    art.appendChild(clampBtn);

    var label = el('p', 'answer-label');
    var labelText = el('span', null, 'JAVOB');
    labelText.setAttribute('data-nomark', '');
    label.appendChild(labelText);
    art.appendChild(label);

    var answer = el('div', 'answer');
    answer.appendChild(parseField(rec.answer, { lede: true }));
    art.appendChild(answer);

    li.appendChild(art);

    return {
      li: li, article: art, qProse: qProse, qBlock: qBlock,
      answer: answer, clampBtn: clampBtn, btnText: btnText, rec: rec,
      clampLimit: 0, isClamped: false
    };
  }

  /* ----------------------------------------------------------- qisqartirish --

     -webkit-line-clamp ISHLATILMAYDI: 6, 11, 14-yozuvlarning savoli ichida
     haqiqiy <ol> bor, display:-webkit-box esa blok bolalarni buzadi.
     O'rniga qator balandligi o'lchanadi va px'da max-height qo'yiladi.
  -------------------------------------------------------------------------- */

  function measureClamp(e) {
    if (e.qProse.classList.contains('is-clamped')) {
      e.qProse.style.maxHeight = '';
      e.qProse.classList.remove('is-clamped');
    }
    var cs = getComputedStyle(e.qProse);
    var lh = parseFloat(cs.lineHeight);
    if (!lh || isNaN(lh)) lh = parseFloat(cs.fontSize) * 1.5;
    var limit = CLAMP_LINES * lh;
    e.clampLimit = limit;

    var expanded = e.clampBtn.getAttribute('aria-expanded') === 'true';
    if (e.qProse.scrollHeight > limit + lh * 0.5) {
      e.clampBtn.hidden = false;
      e.isClamped = true;
      if (!expanded) collapse(e, true);
    } else {
      e.clampBtn.hidden = true;
      e.isClamped = false;
      e.qProse.style.maxHeight = '';
      e.qProse.classList.remove('is-clamped');
      e.clampBtn.setAttribute('aria-expanded', 'false');
    }
  }

  function collapse(e, instant) {
    if (!e.isClamped) return;
    e.qProse.classList.add('is-clamped');
    if (instant || reduceMotion()) {
      e.qProse.style.maxHeight = e.clampLimit + 'px';
    } else {
      e.qProse.style.maxHeight = e.qProse.scrollHeight + 'px';
      e.qProse.classList.add('is-animating');
      requestAnimationFrame(function () {
        e.qProse.style.maxHeight = e.clampLimit + 'px';
      });
    }
    e.clampBtn.setAttribute('aria-expanded', 'false');
    e.btnText.textContent = "To'liq savolni ko'rish";
  }

  function expand(e, instant) {
    if (!e.isClamped) return;
    var target = e.qProse.scrollHeight + 2;
    if (instant || reduceMotion()) {
      e.qProse.classList.remove('is-clamped');
      e.qProse.style.maxHeight = '';
    } else {
      e.qProse.classList.add('is-animating');
      e.qProse.style.maxHeight = target + 'px';
      e.qProse.classList.remove('is-clamped');
    }
    e.clampBtn.setAttribute('aria-expanded', 'true');
    e.btnText.textContent = 'Qisqartirish';
  }

  /* ------------------------------------------------------------------ DOM -- */

  var $ = function (id) { return document.getElementById(id); };

  var input, statusVis, statusLive, clearBtn, listEl, emptyEl, emptyBody,
      railList, railHead, kbdHint, countInline, searchwrap;

  var statusTimer = null;
  var lastTier = 1;

  function setStatus(html) {
    statusVis.textContent = '';
    statusVis.appendChild(html.node);
    statusVis.classList.toggle('is-zero', !!html.zero);
    syncStuckHeight();
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(function () {
      statusLive.textContent = html.text;
    }, STATUS_DELAY);
  }

  function statusRest(total) {
    var f = document.createDocumentFragment();
    f.appendChild(document.createTextNode('Jami '));
    f.appendChild(el('span', 'n', String(total)));
    f.appendChild(document.createTextNode(' ta savol'));
    return { node: f, text: 'Jami ' + total + ' ta savol' };
  }

  function clearButtonNode() {
    var b = el('button', 'linkbtn', 'Tozalash');
    b.type = 'button';
    b.addEventListener('click', function () { resetQuery(); });
    return b;
  }

  function echoNode(query) {
    var s = el('span', 'echo');
    s.appendChild(document.createTextNode('«' + query + '»'));
    return s;
  }

  function statusFiltered(total, found, query, approx) {
    var f = document.createDocumentFragment();
    var text;
    if (approx) {
      f.appendChild(document.createTextNode('Aniq moslik topilmadi. Yaqin natijalar: '));
      f.appendChild(el('span', 'n', String(found)));
      f.appendChild(document.createTextNode(' ta'));
      text = 'Aniq moslik topilmadi. Yaqin natijalar: ' + found + ' ta';
    } else {
      f.appendChild(el('span', 'n', String(total)));
      f.appendChild(document.createTextNode(' tadan '));
      f.appendChild(el('span', 'n', String(found)));
      f.appendChild(document.createTextNode(' tasi topildi'));
      text = total + ' tadan ' + found + ' tasi topildi';
    }
    f.appendChild(el('span', 'dot', '·'));
    f.appendChild(echoNode(query));
    f.appendChild(clearButtonNode());
    return { node: f, text: text };
  }

  function statusZero() {
    var f = document.createDocumentFragment();
    f.appendChild(document.createTextNode('Natija topilmadi'));
    return { node: f, text: 'Natija topilmadi', zero: true };
  }

  /* --------------------------------------------------------------- filtr -- */

  var currentQuery = '';

  function render(query) {
    currentQuery = query;
    var trimmed = query.trim();
    var res = runSearch(trimmed);
    var total = entries.length;
    var i, e;

    clearBtn.hidden = !query.length;
    if (kbdHint) kbdHint.hidden = query.length > 0;

    // Bo'sh yoki faqat tinish belgisidan iborat so'rov — to'liq ro'yxat.
    if (!res.tokens.length && res.tier === 0) {
      for (i = 0; i < entries.length; i++) {
        e = entries[i];
        clearMarks(e.qProse); clearMarks(e.answer);
        e.li.hidden = false;
        if (e.autoExpanded && !e.userExpanded) { collapse(e); e.autoExpanded = false; }
      }
      emptyEl.hidden = true;
      listEl.hidden = false;
      setStatus(statusRest(total));
      countInline.classList.remove('is-on');
      updateRail(null);
      if (trimmed !== '') { /* faqat emoji kabi so'rov — hech narsa filtrlanmadi */ }
      restoreStagger();
      return;
    }

    var hitSet = {};
    for (i = 0; i < res.hits.length; i++) hitSet[res.hits[i]] = true;

    for (i = 0; i < entries.length; i++) {
      e = entries[i];
      clearMarks(e.qProse);
      clearMarks(e.answer);
      var on = !!hitSet[i];
      if (!on) {
        if (e.li.contains(document.activeElement)) input.focus();
        e.li.hidden = true;
        if (e.autoExpanded && !e.userExpanded) { collapse(e, true); e.autoExpanded = false; }
        continue;
      }
      e.li.hidden = false;
      if (res.tier !== 3 && res.tokens.length) {
        var used = applyMarks(e.qProse, res.tokens, res.tier, MAX_MARKS);
        applyMarks(e.answer, res.tokens, res.tier, MAX_MARKS - used);
        // Belgi qisqartirilgan qismda qolib ketmasin.
        if (e.isClamped && e.clampBtn.getAttribute('aria-expanded') !== 'true'
            && e.qProse.querySelector('mark')) {
          expand(e, true);
          e.autoExpanded = true;
        }
      }
    }

    var found = res.hits.length;
    listEl.hidden = found === 0;
    emptyEl.hidden = found !== 0;

    if (found === 0) {
      emptyBody.textContent = '';
      emptyBody.appendChild(document.createTextNode('«' + trimmed + '»'));
      emptyBody.appendChild(document.createTextNode(
        " bo'yicha natija yo'q. Boshqacha yozib ko'ring yoki so'rovni qisqartiring."));
      setStatus(statusZero());
    } else {
      // 2- va 3-pog'ona taxminiy: foydalanuvchi natija nega "boshqacha"
      // ekanini bilib tursin.
      setStatus(statusFiltered(total, found, trimmed, res.tier >= 2));
    }

    countInline.textContent = found + '/' + total;
    countInline.classList.add('is-on');
    lastTier = res.tier;
    updateRail(hitSet, found);
  }

  var staggerTimer = null;
  function restoreStagger() {
    if (reduceMotion()) return;
    listEl.classList.remove('is-restoring');
    void listEl.offsetWidth;
    listEl.classList.add('is-restoring');
    if (staggerTimer) clearTimeout(staggerTimer);
    staggerTimer = setTimeout(function () { listEl.classList.remove('is-restoring'); }, 400);
  }

  function resetQuery() {
    input.value = '';
    render('');
    input.focus();
  }

  /* ---------------------------------------------------------------- rail -- */

  function updateRail(hitSet, found) {
    if (!railList.children.length) return;
    for (var i = 0; i < entries.length; i++) {
      var link = entries[i].railLink;
      if (!link) continue;
      link.hidden = hitSet ? !hitSet[i] : false;
    }
    railHead.textContent = '';
    railHead.appendChild(document.createTextNode(hitSet ? 'TOPILDI ' : 'SAVOLLAR '));
    railHead.appendChild(el('span', 'n', '(' + (hitSet ? found : entries.length) + ' ta)'));
  }

  /* -------------------------------------------------------------- kuzatuv -- */

  /* Yopishqoq panelning haqiqiy balandligi qidiruv maydoni + status qatoridan
     iborat va holatga qarab o'zgaradi. Uni o'lchab --stuck-h ga yozamiz:
     anchor sakrashi (scroll-margin-top) va yon ro'yxatning sticky top'i
     shu bitta qiymatdan o'qiydi. */
  function syncStuckHeight() {
    if (!searchwrap) return;
    var h = Math.round(searchwrap.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty('--stuck-h', h + 'px');
  }

  function setupObservers() {
    var sentinel = $('sentinel');
    if (sentinel && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (recs) {
        if (!recs.length) return;
        if (!recs[0].isIntersecting && !searchwrap.classList.contains('is-focus')) {
          searchwrap.classList.add('is-stuck');
        } else if (recs[0].isIntersecting) {
          searchwrap.classList.remove('is-stuck');
        }
        requestAnimationFrame(syncStuckHeight);
      }, { threshold: 0 }).observe(sentinel);
    }

    var topSentinel = $('sentinel-top');
    var totop = $('totop');
    if (topSentinel && totop && 'IntersectionObserver' in window) {
      totop.hidden = false;
      new IntersectionObserver(function (recs) {
        totop.classList.toggle('is-on', !recs[0].isIntersecting && recs[0].boundingClientRect.top < 0);
      }, { threshold: 0 }).observe(topSentinel);
    }

    if ('IntersectionObserver' in window && window.matchMedia('(min-width: 1240px)').matches) {
      var stuck = getComputedStyle(document.documentElement).getPropertyValue('--stuck-h').trim() || '60px';
      var current = null;
      var io = new IntersectionObserver(function (recs) {
        for (var i = 0; i < recs.length; i++) {
          if (recs[i].isIntersecting) { current = recs[i].target.id; break; }
        }
        for (var j = 0; j < entries.length; j++) {
          var l = entries[j].railLink;
          if (l) l.classList.toggle('is-current', entries[j].rec.slug === current);
        }
      }, { rootMargin: '-' + stuck + ' 0px -68% 0px', threshold: 0 });
      for (var k = 0; k < entries.length; k++) io.observe(entries[k].article);
    }
  }

  /* --------------------------------------------------------------- mavzu -- */

  var MOON = '<svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
    '<path d="M17.5 10.66A7.5 7.5 0 1 1 9.34 2.5 5.83 5.83 0 0 0 17.5 10.66z" fill="currentColor"/></svg>';
  var SUN = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">' +
    '<circle cx="10" cy="10" r="3.4" stroke="currentColor" stroke-width="1.5"/>' +
    '<g stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
    '<line x1="10" y1="1.6" x2="10" y2="3.4"/><line x1="10" y1="16.6" x2="10" y2="18.4"/>' +
    '<line x1="1.6" y1="10" x2="3.4" y2="10"/><line x1="16.6" y1="10" x2="18.4" y2="10"/>' +
    '<line x1="4.1" y1="4.1" x2="5.4" y2="5.4"/><line x1="14.6" y1="14.6" x2="15.9" y2="15.9"/>' +
    '<line x1="4.1" y1="15.9" x2="5.4" y2="14.6"/><line x1="14.6" y1="5.4" x2="15.9" y2="4.1"/>' +
    '</g></svg>';

  function currentTheme() {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  }

  function paintTheme(btn) {
    var dark = currentTheme() === 'dark';
    btn.innerHTML = dark ? SUN : MOON;
    btn.setAttribute('aria-label', dark ? "Yorug' rejimga o'tish" : "Qorong'i rejimga o'tish");
  }

  function setupTheme() {
    var btn = $('theme');
    paintTheme(btn);
    btn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('ama-theme', next); } catch (e) {}
      paintTheme(btn);
    });
  }

  /* ---------------------------------------------------------- klaviatura -- */

  function isTyping(node) {
    if (!node) return false;
    var tag = node.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
  }

  function visibleEntries() {
    return entries.filter(function (e) { return !e.li.hidden; });
  }

  function focusables(e) {
    return e.article.querySelectorAll('button:not([hidden])');
  }

  function setupKeys() {
    document.addEventListener('keydown', function (ev) {
      if ((ev.key === '/' || ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k'))
          && !isTyping(document.activeElement)) {
        ev.preventDefault();
        input.focus();
        input.select();
      }
    });

    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        if (input.value) {
          ev.preventDefault();
          input.value = '';
          render('');
          statusLive.textContent = 'Qidiruv tozalandi';
          input.focus();
        } else {
          input.blur();
        }
      } else if (ev.key === 'ArrowDown') {
        var vis = visibleEntries();
        if (vis.length) {
          var f = focusables(vis[0]);
          if (f.length) { ev.preventDefault(); f[0].focus(); }
        }
      }
    });

    listEl.addEventListener('keydown', function (ev) {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].indexOf(ev.key) === -1) return;
      var vis = visibleEntries();
      if (!vis.length) return;
      var idx = -1;
      for (var i = 0; i < vis.length; i++) {
        if (vis[i].li.contains(document.activeElement)) { idx = i; break; }
      }
      var target = null;
      if (ev.key === 'Home') target = vis[0];
      else if (ev.key === 'End') target = vis[vis.length - 1];
      else if (idx !== -1) {
        var next = ev.key === 'ArrowDown' ? idx + 1 : idx - 1;
        if (next < 0) { ev.preventDefault(); input.focus(); return; }
        target = vis[next] || null;
      }
      if (!target) return;
      var f = focusables(target);
      ev.preventDefault();
      if (f.length) f[0].focus();
      else { target.article.setAttribute('tabindex', '-1'); target.article.focus(); }
    });
  }


  /* ============================================================== eksport --

     Word va Excel — bu ZIP ichidagi XML fayllar to'plami, boshqa hech narsa
     emas. Shuning uchun siqishsiz (store) ZIP yozuvchi yozildi: kutubxona ham,
     build ham kerak emas, hosil bo'lgan fayl Word / Excel / Numbers / Google
     Docs da to'g'ri ochiladi.

     PDF esa brauzerning chop etish oynasi orqali beriladi ("PDF sifatida
     saqlash"). Sababi: qo'lda yasalgan PDF standart shriftlar bilan cheklanadi
     va o'zbekcha oʻ / sunʼiy kabi harflarni ham, emojini ham buzadi. Brauzer
     esa hammasini to'g'ri chizadi.
  -------------------------------------------------------------------------- */

  var CRC_TABLE = null;
  function crcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    CRC_TABLE = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[i] = c >>> 0;
    }
    return CRC_TABLE;
  }

  function crc32(bytes) {
    var t = crcTable(), c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  var UTF8 = new TextEncoder();

  /* files: [{name, text}] -> Blob (siqishsiz ZIP) */
  function zip(files) {
    var chunks = [], central = [], offset = 0;
    var now = new Date();
    var time = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
    var date = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

    function u16(n) { return [n & 0xFF, (n >>> 8) & 0xFF]; }
    function u32(n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }

    for (var i = 0; i < files.length; i++) {
      var nameBytes = UTF8.encode(files[i].name);
      var data = UTF8.encode(files[i].text);
      var sum = crc32(data);

      var local = [].concat(
        u32(0x04034B50), u16(20), u16(0x0800), u16(0), u16(time), u16(date),
        u32(sum), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0));
      chunks.push(new Uint8Array(local), nameBytes, data);

      central.push(new Uint8Array([].concat(
        u32(0x02014B50), u16(20), u16(20), u16(0x0800), u16(0), u16(time), u16(date),
        u32(sum), u32(data.length), u32(data.length), u16(nameBytes.length),
        u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset))));
      central.push(nameBytes);

      offset += local.length + nameBytes.length + data.length;
    }

    var cdSize = 0;
    for (var j = 0; j < central.length; j++) cdSize += central[j].length;

    var end = new Uint8Array([].concat(
      u32(0x06054B50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(cdSize), u32(offset), u16(0)));

    return new Blob(chunks.concat(central, [end]), { type: 'application/octet-stream' });
  }

  /* XMLda taqiqlangan boshqaruv belgilari ham olib tashlanadi. */
  var CTRL = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;
  function xmlText(s) {
    return String(s).replace(CTRL, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');   /* apostrof matn ichida qochirilmaydi:
         u XMLda oddiy belgi, atributlar esa qo'sh tirnoqda yoziladi. */
  }

  var RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="%TARGET%"/>' +
    '</Relationships>';

  function docxBlob(rows, title) {
    var W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    function para(text, opts) {
      opts = opts || {};
      var size = opts.size || 22;
      var rpr = '<w:rPr>' + (opts.bold ? '<w:b/>' : '') +
        (opts.color ? '<w:color w:val="' + opts.color + '"/>' : '') +
        '<w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/></w:rPr>';
      var runs = String(text).split('\n').map(function (line, i) {
        return (i ? '<w:r>' + rpr + '<w:br/></w:r>' : '') +
               '<w:r>' + rpr + '<w:t xml:space="preserve">' + xmlText(line) + '</w:t></w:r>';
      }).join('');
      return '<w:p><w:pPr><w:spacing w:before="' + (opts.before || 0) +
             '" w:after="' + (opts.after == null ? 120 : opts.after) + '"/>' +
             (opts.outline ? '<w:outlineLvl w:val="0"/>' : '') + '</w:pPr>' + runs + '</w:p>';
    }

    var body = para(title, { bold: true, size: 36, after: 320 });
    for (var i = 0; i < rows.length; i++) {
      body += para('SAVOL ' + pad(i + 1, 2), { bold: true, size: 16, color: '707579', before: 320, after: 80, outline: true });
      body += para(rows[i].question, { size: 22, after: 160 });
      body += para('JAVOB', { bold: true, size: 16, color: '3390EC', after: 80 });
      body += para(rows[i].answer, { size: 22, after: 240 });
    }

    var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="' + W + '"><w:body>' + body +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>' +
      '</w:body></w:document>';

    var types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>';

    return zip([
      { name: '[Content_Types].xml', text: types },
      { name: '_rels/.rels', text: RELS.replace('%TARGET%', 'word/document.xml') },
      { name: 'word/document.xml', text: doc }
    ]);
  }

  function xlsxBlob(rows, title) {
    var S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    var R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

    function cell(ref, value, style) {
      return '<c r="' + ref + '" t="inlineStr" s="' + style + '">' +
             '<is><t xml:space="preserve">' + xmlText(value) + '</t></is></c>';
    }

    var sheet = '<row r="1" ht="22" customHeight="1">' +
      cell('A1', '#', 2) + cell('B1', 'Savol', 2) + cell('C1', 'Javob', 2) + '</row>';
    for (var i = 0; i < rows.length; i++) {
      var r = i + 2;
      sheet += '<row r="' + r + '">' +
        cell('A' + r, String(i + 1), 1) +
        cell('B' + r, rows[i].question, 1) +
        cell('C' + r, rows[i].answer, 1) + '</row>';
    }

    var sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="' + S + '">' +
      '<cols><col min="1" max="1" width="5" customWidth="1"/>' +
      '<col min="2" max="2" width="52" customWidth="1"/>' +
      '<col min="3" max="3" width="86" customWidth="1"/></cols>' +
      '<sheetData>' + sheet + '</sheetData></worksheet>';

    /* s="1" — matn o'ralsin va yuqoriga tekislansin; s="2" — sarlavha qatori. */
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="' + S + '">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border/></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="3">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">' +
      '<alignment vertical="top" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1">' +
      '<alignment vertical="center"/></xf>' +
      '</cellXfs></styleSheet>';

    var workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="' + S + '" xmlns:r="' + R + '">' +
      '<sheets><sheet name="' + xmlText(title.slice(0, 28)) + '" sheetId="1" r:id="rId1"/></sheets></workbook>';

    var wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + R + '/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="' + R + '/styles" Target="styles.xml"/>' +
      '</Relationships>';

    var types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>';

    return zip([
      { name: '[Content_Types].xml', text: types },
      { name: '_rels/.rels', text: RELS.replace('%TARGET%', 'xl/workbook.xml') },
      { name: 'xl/workbook.xml', text: workbook },
      { name: 'xl/_rels/workbook.xml.rels', text: wbRels },
      { name: 'xl/styles.xml', text: styles },
      { name: 'xl/worksheets/sheet1.xml', text: sheetXml }
    ]);
  }

  function saveBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* Ayni damda ko'rinib turgan yozuvlar eksport qilinadi: qidiruv faol bo'lsa
     faqat topilganlari tushadi. */
  function exportRows() {
    var rows = [];
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].li.hidden) continue;
      rows.push({ question: entries[i].rec.question, answer: entries[i].rec.answer });
    }
    return rows;
  }

  function exportName(ext) {
    var q = normalize(currentQuery).replace(/ /g, '-').slice(0, 32);
    return 'savol-javob' + (q ? '-' + q : '') + '.' + ext;
  }

  function exportTitle(count) {
    var q = currentQuery.trim();
    return 'Savol-javob' + (q ? ' — «' + q + '»' : '') + ' (' + count + ' ta)';
  }

  function runExport(fmt) {
    var rows = exportRows();
    if (!rows.length) return;
    var title = exportTitle(rows.length);

    if (fmt === 'json') {
      saveBlob(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }),
               exportName('json'));
    } else if (fmt === 'docx') {
      saveBlob(docxBlob(rows, title), exportName('docx'));
    } else if (fmt === 'xlsx') {
      saveBlob(xlsxBlob(rows, title), exportName('xlsx'));
    } else if (fmt === 'pdf') {
      // Brauzerning chop etish oynasi "PDF sifatida saqlash" imkonini beradi.
      window.print();
    }
  }

  function setupExport() {
    var wrap = $('dl'), btn = $('dl-btn'), menu = $('dl-menu'), head = $('dl-head');
    if (!wrap || !btn || !menu) return;
    var items = menu.querySelectorAll('[role="menuitem"]');

    function open() {
      var n = exportRows().length;
      head.textContent = n + ' TA SAVOL-JAVOB';
      for (var i = 0; i < items.length; i++) items[i].disabled = n === 0;
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', onOutside, true);
    }
    function close(focusBtn) {
      if (menu.hidden) return;
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', onOutside, true);
      if (focusBtn) btn.focus();
    }
    function onOutside(ev) { if (!wrap.contains(ev.target)) close(false); }

    btn.addEventListener('click', function () {
      if (menu.hidden) { open(); items[0].focus(); } else { close(true); }
    });

    menu.addEventListener('click', function (ev) {
      var item = ev.target.closest('[role="menuitem"]');
      if (!item || item.disabled) return;
      close(true);
      runExport(item.getAttribute('data-fmt'));
    });

    wrap.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); close(true); return; }
      if (menu.hidden) return;
      var list = Array.prototype.slice.call(items);
      var at = list.indexOf(document.activeElement);
      if (ev.key === 'ArrowDown') { ev.preventDefault(); list[(at + 1) % list.length].focus(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); list[(at - 1 + list.length) % list.length].focus(); }
      else if (ev.key === 'Home') { ev.preventDefault(); list[0].focus(); }
      else if (ev.key === 'End') { ev.preventDefault(); list[list.length - 1].focus(); }
      else if (ev.key === 'Tab') close(false);
    });

    window.AMA_EXPORT = { rows: exportRows, docx: docxBlob, xlsx: xlsxBlob, zip: zip, name: exportName };
  }

  /* ---------------------------------------------------------------- boot -- */

  /* Yagona manba — question-asnwer.json. Sayt serverdan (Netlify, Vercel yoki
     lokal server) ochilganda fayl to'g'ridan-to'g'ri o'qiladi, ya'ni JSON
     o'zgarsa sahifani yangilash kifoya. */
  function loadData() {
    return fetch('question-asnwer.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!Array.isArray(data)) throw new Error('JSON ildizi ro’yxat emas');
        return data;
      });
  }

  function showBootError(err) {
    var box = $('boot-error');
    var body = $('boot-error-body');
    var isFile = location.protocol === 'file:';
    body.textContent = '';
    if (isFile) {
      // file:// da brauzer fetch'ga ruxsat bermaydi — bu kodning xatosi emas.
      body.appendChild(document.createTextNode(
        'Brauzer faylni to’g’ridan-to’g’ri ochganda JSON o’qishga ruxsat bermaydi. ' +
        'Loyiha papkasida '));
      body.appendChild(el('code', null, 'npx serve'));
      body.appendChild(document.createTextNode(' yoki '));
      body.appendChild(el('code', null, 'python3 -m http.server'));
      body.appendChild(document.createTextNode(
        ' ni ishga tushiring. Netlify yoki Vercelga joylanganda hammasi o’zi ishlaydi.'));
    } else {
      body.appendChild(document.createTextNode('question-asnwer.json o’qilmadi'));
      if (err && err.message) body.appendChild(document.createTextNode(' — ' + err.message));
      body.appendChild(document.createTextNode('. Fayl shu papkada va yaroqli JSON ekanini tekshiring.'));
    }
    box.hidden = false;
    listEl.hidden = true;
  }

  function init(raw) {
    records = buildRecords(raw);
    if (!records.length) { showBootError(); return; }

    var total = records.length;
    var i;

    $('foot-total').textContent = 'Jami ' + total + ' ta savol-javob.';

    var listFrag = document.createDocumentFragment();
    var railFrag = document.createDocumentFragment();
    entries = [];

    for (i = 0; i < records.length; i++) {
      var e = buildEntry(records[i], i, total);
      entries.push(e);
      listFrag.appendChild(e.li);

      var a = document.createElement('a');
      a.href = '#' + records[i].slug;
      a.appendChild(el('span', 'ord', pad(i + 1, String(total).length < 2 ? 2 : String(total).length)));
      a.appendChild(el('span', 'txt', truncate(records[i].lead, 90)));
      e.railLink = a;
      railFrag.appendChild(a);
    }
    listEl.textContent = '';
    listEl.appendChild(listFrag);
    railList.textContent = '';
    railList.appendChild(railFrag);

    // Qisqartirishni o'lchash — shriftlar joylashgandan keyin.
    var measureAll = function () {
      for (var j = 0; j < entries.length; j++) measureClamp(entries[j]);
    };
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { requestAnimationFrame(measureAll); });
    } else {
      requestAnimationFrame(measureAll);
    }

    for (i = 0; i < entries.length; i++) {
      (function (e) {
        e.clampBtn.addEventListener('click', function () {
          var open = e.clampBtn.getAttribute('aria-expanded') === 'true';
          if (open) { collapse(e); e.userExpanded = false; e.autoExpanded = false; }
          else { expand(e); e.userExpanded = true; e.autoExpanded = false; }
        });
        e.qProse.addEventListener('transitionend', function (ev) {
          if (ev.propertyName !== 'max-height') return;
          e.qProse.classList.remove('is-animating');
          if (e.clampBtn.getAttribute('aria-expanded') === 'true') e.qProse.style.maxHeight = '';
        });
      })(entries[i]);
    }

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { measureAll(); syncStuckHeight(); }, 150);
    });

    render('');
    syncStuckHeight();
    setupObservers();
    setupKeys();
    setupExport();

    // Yon ro'yxatdan sakrash — nishon belgisi.
    window.addEventListener('hashchange', flagTarget);
    flagTarget();

    // Yuklanishda maydonga fokus BERILMAYDI: bu o'qish sahifasi, probel va
    // PageDown bilan varaqlash ishlashi kerak. '/' yoki Cmd+K bosilsa fokus keladi.

    window.AMA = {
      normalize: normalize,
      normMap: normMap,
      search: function (q) { return runSearch(q).hits; },
      records: records,
      entries: entries
    };

    if (window.console && console.assert) {
      var corpus = records.map(function (r) { return r.strict; }).join(' | ');
      CHIPS.forEach(function (c) {
        console.assert(corpus.indexOf(normalize(c)) !== -1, 'Chip korpusda topilmadi: ' + c);
      });
    }
  }

  var targetTimer = null;
  function flagTarget() {
    var id = location.hash.slice(1);
    if (!id) return;
    for (var i = 0; i < entries.length; i++) {
      entries[i].article.classList.toggle('is-targeted', entries[i].rec.slug === id);
    }
    if (targetTimer) clearTimeout(targetTimer);
    targetTimer = setTimeout(function () {
      for (var j = 0; j < entries.length; j++) entries[j].article.classList.remove('is-targeted');
    }, 1640);
  }

  function setupChrome() {
    input = $('q');
    statusVis = $('status-visible');
    statusLive = $('status');
    clearBtn = $('clear');
    listEl = $('savollar');
    emptyEl = $('empty');
    emptyBody = $('empty-body');
    railList = $('rail-list');
    railHead = $('rail-head');
    kbdHint = $('kbdhint');
    countInline = $('count-inline');
    searchwrap = $('searchwrap');

    $('searchform').addEventListener('submit', function (ev) { ev.preventDefault(); });
    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('focus', function () { searchwrap.classList.add('is-stuck', 'is-focus'); });
    input.addEventListener('blur', function () {
      searchwrap.classList.remove('is-focus');
      var s = $('sentinel');
      if (s && s.getBoundingClientRect().top > 0) searchwrap.classList.remove('is-stuck');
    });
    clearBtn.addEventListener('click', resetQuery);
    $('empty-clear').addEventListener('click', resetQuery);

    var chips = $('chips');
    CHIPS.forEach(function (c) {
      var b = el('button', null, c);
      b.type = 'button';
      b.addEventListener('click', function () {
        input.value = c;
        render(c);
        input.focus();
      });
      chips.appendChild(b);
    });

    $('totop').addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
      input.focus();
    });

    setupTheme();
  }

  function start() {
    setupChrome();
    loadData().then(function (data) {
      if (!data.length) { showBootError(new Error('ro’yxat bo’sh')); return; }
      init(data);
    }).catch(showBootError);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
