// Builds one page per area (e.g. /areas/tebrau/ and /zh/areas/tebrau/) from
// the listing cards already on index.html and zh/index.html, plus the sitemap
// and the area list in llms.txt. Runs after build-zh (npm run build, and the
// daily GitHub Action), so area pages always match the current listings.
//
// Areas that drop to zero listings keep their page (with a "none right now"
// note) so their URL never breaks; areas with fewer than MIN_INDEXED listings
// are marked noindex and left out of the sitemap to avoid thin pages.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://constancechan.my";
const MIN_INDEXED = 2;
const WA = "60192288249";
const MANIFEST = join(root, "areas", "areas.json");

const ZH_AREA = {
  "Johor Bahru": "新山", Skudai: "士古来", Tebrau: "地不佬", "Ulu Tiram": "乌鲁地南", Masai: "马赛",
  Senai: "士乃", Kulai: "古来", Tampoi: "淡杯", "Pasir Gudang": "巴西古当",
  "Iskandar Puteri (Nusajaya)": "依斯干达公主城", "Iskandar Puteri": "依斯干达公主城",
  "Kota Tinggi": "哥打丁宜", Pontian: "笨珍", Tangkak: "东甲",
};
const zhArea = (a) => (ZH_AREA[a] ? `${ZH_AREA[a]} ${a}` : a);
const slugOf = (a) => a.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&middot;/g, "·");
const fmt = (n) => n.toLocaleString("en-MY");

// ---------- read the source pages
const en = readFileSync(join(root, "index.html"), "utf8");
const zh = readFileSync(join(root, "zh", "index.html"), "utf8");

function cardsOf(html) {
  const block = html.slice(html.indexOf("<!-- LISTINGS:FEATURED:START -->"), html.indexOf("<!-- LISTINGS:MORE:END -->"));
  return [...block.matchAll(/<article class="prop-card[\s\S]*?<\/article>/g)].map((m) => {
    const card = m[0].replace(/class="prop-card reveal /, 'class="prop-card ');
    const attr = (k) => decode((card.match(new RegExp(`data-${k}="([^"]*)"`)) || [])[1] || "");
    const badge = decode((card.match(/class="prop-badge">([^<]*)/) || [])[1] || "");
    return { html: card, area: attr("area"), deal: attr("deal"), url: attr("url"), title: attr("title"), price: attr("price"), type: (badge.split("·")[1] || "").trim(), img: (card.match(/<img src="([^"]*)"/) || [])[1] || "" };
  });
}
const enCards = cardsOf(en);
const zhCards = cardsOf(zh);
if (!enCards.length || enCards.length !== zhCards.length) throw new Error(`build-areas: card count mismatch (en ${enCards.length}, zh ${zhCards.length}); run build-zh first`);

const styleBlock = en.match(/<style>[\s\S]*?<\/style>/)[0];
const headLinks = [
  ...en.matchAll(/<link rel="(?:icon|apple-touch-icon|preconnect)"[^>]*>|<link href="https:\/\/fonts\.googleapis\.com[^>]*>|<link rel="stylesheet" href="\/css\/tailwind\.css[^>]*>/g),
].map((m) => m[0]).join("\n");
const updatedEn = ((en.match(/Listings updated ([^\n<]*)/) || [])[1] || "").trim();
const updatedZh = ((zh.match(/房源更新于 ([^\n<]*)/) || [])[1] || "").trim();
const isoDate = (() => {
  const m = (en.match(/"dateModified": "([0-9-]+)"/) || [])[1];
  return m || new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
})();

// ---------- group by area (keep previously published areas alive)
const groups = new Map();
for (let i = 0; i < enCards.length; i++) {
  const a = enCards[i].area;
  if (!groups.has(a)) groups.set(a, { en: [], zh: [] });
  groups.get(a).en.push(enCards[i]);
  groups.get(a).zh.push(zhCards[i]);
}
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
for (const a of Object.values(manifest)) if (!groups.has(a)) groups.set(a, { en: [], zh: [] });
const areas = [...groups.entries()]
  .map(([name, g]) => ({ name, slug: slugOf(name), ...g, n: g.en.length }))
  .sort((x, y) => y.n - x.n || x.name.localeCompare(y.name));

// ---------- facts for each area (all computed from the cards)
function facts(list) {
  const num = (p) => Number(p.replace(/[^0-9.]/g, ""));
  const sale = list.filter((c) => c.deal === "sale");
  const rent = list.filter((c) => c.deal === "rent");
  const range = (arr) => (arr.length ? [Math.min(...arr.map((c) => num(c.price))), Math.max(...arr.map((c) => num(c.price)))] : null);
  const types = [...new Set(list.map((c) => c.type).filter(Boolean))];
  return { sale: sale.length, rent: rent.length, saleRange: range(sale), rentRange: range(rent), types };
}
const rangeText = (r, zh, perMonth) => {
  if (!r) return "";
  const unit = perMonth ? (zh ? "/月" : "/month") : "";
  return r[0] === r[1] ? `RM ${fmt(r[0])}${unit}` : zh ? `RM ${fmt(r[0])} 至 RM ${fmt(r[1])}${unit}` : `RM ${fmt(r[0])} to RM ${fmt(r[1])}${unit}`;
};

const TYPE_ZH_RE = /(?:^|· )([^·<]+)$/;
function typesZh(zhList) {
  return [...new Set(zhList.map((c) => (decode((c.html.match(/class="prop-badge">([^<]*)/) || [])[1] || "").match(TYPE_ZH_RE) || [])[1]).filter(Boolean).map((s) => s.trim()))];
}

// ---------- page template
const COPY = {
  en: {
    lang: "en", home: "/", areasBase: "/areas/", other: "/zh/areas/", locale: "en_MY",
    title: (a) => `Property for Sale & Rent in ${a} | Constance Chan (PEA3963)`,
    h1: (a) => `Property for sale & rent in ${a}`,
    crumbHome: "Home", crumbAreas: "Areas",
    intro(a, f, n) {
      if (!n) return `There are no listings in ${a} right now. Message Constance on WhatsApp and she will let you know when something suitable comes up.`;
      const p = (k) => `${k} ${k === 1 ? "property" : "properties"}`;
      const parts = [
        f.sale && f.rent
          ? `Constance Chan currently has ${p(n)} listed in ${a}: ${f.sale} for sale and ${f.rent} for rent.`
          : `Constance Chan currently has ${p(n)} for ${f.sale ? "sale" : "rent"} in ${a}.`,
      ];
      if (f.types.length) parts.push(`Property types: ${f.types.join(", ")}.`);
      if (f.saleRange) parts.push(`Asking prices: ${rangeText(f.saleRange, false)}.`);
      if (f.rentRange) parts.push(`Rents: ${rangeText(f.rentRange, false, true)}.`);
      return parts.join(" ");
    },
    about: "Constance Chan (PEA3963) is a Johor Bahru property agent at The Roof Realty (E(1)1605/1). Her service area is centred on Tebrau and covers Johor Bahru and the surrounding areas.",
    updated: updatedEn ? `Listings updated ${updatedEn}` : "",
    listHeading: (a) => `Current listings in ${a}`,
    sellHeading: (a) => `Selling or renting out in ${a}?`,
    sellText: "Get a free price estimate. Tell Constance the area, property type and size and she will reply on WhatsApp.",
    sellBtn: "Get a free price estimate",
    otherHeading: "Other areas I cover",
    allListings: "View all listings",
    waBtn: "WhatsApp",
    waArea: (a) => `Hi Constance, I'm looking for property in ${a}.`,
    waCard: "Hi Constance, I'm interested in this property:",
    copied: "Link copied",
    desc(a, f, n) {
      if (!n) return `Property in ${a}, Johor Bahru, with Constance Chan (PEA3963), The Roof Realty. No listings right now; message her on WhatsApp.`;
      const what = f.sale && f.rent ? `for sale and rent in ${a}, Johor Bahru (${f.sale} for sale, ${f.rent} for rent)` : `for ${f.sale ? "sale" : "rent"} in ${a}, Johor Bahru`;
      return `${n} ${n === 1 ? "property" : "properties"} ${what}. Listed by Constance Chan (PEA3963), The Roof Realty.`;
    },
    footer: "PEA3963 · The Roof Realty · E(1)1605/1",
  },
  zh: {
    lang: "zh-Hans", home: "/zh/", areasBase: "/zh/areas/", other: "/areas/", locale: "zh_CN",
    title: (a) => `${a} 出售与出租房产 | Constance Chan (PEA3963)`,
    h1: (a) => `${a} 出售与出租房产`,
    crumbHome: "首页", crumbAreas: "区域",
    intro(a, f, n, types) {
      if (!n) return `${a} 目前没有房源。欢迎通过 WhatsApp 联系 Constance，有合适的单位时她会通知您。`;
      const parts = [
        f.sale && f.rent
          ? `Constance Chan 目前在 ${a} 有 ${n} 个房源：${f.sale} 个出售，${f.rent} 个出租。`
          : `Constance Chan 目前在 ${a} 有 ${n} 个${f.sale ? "出售" : "出租"}房源。`,
      ];
      if (types.length) parts.push(`物业类型：${types.join("、")}。`);
      if (f.saleRange) parts.push(`售价：${rangeText(f.saleRange, true)}。`);
      if (f.rentRange) parts.push(`租金：${rangeText(f.rentRange, true, true)}。`);
      return parts.join("");
    },
    about: "Constance Chan（PEA3963）是 The Roof Realty（E(1)1605/1）的新山房产经纪，服务区域以地不佬（Tebrau）为中心，涵盖新山及周边地区。",
    updated: updatedZh ? `房源更新于 ${updatedZh}` : "",
    listHeading: (a) => `${a} 现有房源`,
    sellHeading: (a) => `要在 ${a} 出售或出租物业？`,
    sellText: "免费估价：告诉 Constance 区域、物业类型和面积，她会通过 WhatsApp 回复您。",
    sellBtn: "免费估价",
    otherHeading: "我服务的其他区域",
    allListings: "查看全部房源",
    waBtn: "WhatsApp",
    waArea: (a) => `您好 Constance，我想找 ${a} 的房产。`,
    waCard: "您好 Constance，我对这个房源有兴趣：",
    copied: "已复制链接",
    desc(a, f, n) {
      if (!n) return `${a}（新山）房产，由 Constance Chan（PEA3963，The Roof Realty）服务。目前没有房源，欢迎 WhatsApp 联系。`;
      const what = f.sale && f.rent ? `出售与出租房源（${f.sale} 个出售，${f.rent} 个出租）` : `${f.sale ? "出售" : "出租"}房源`;
      return `${a}（新山）共 ${n} 个${what}，由 Constance Chan（PEA3963，The Roof Realty）刊登。`;
    },
    footer: "PEA3963 · The Roof Realty · E(1)1605/1",
  },
};

function page(area, lang) {
  const c = COPY[lang];
  const isZh = lang === "zh";
  const name = isZh ? zhArea(area.name) : area.name;
  const list = isZh ? area.zh : area.en;
  const f = facts(area.en);
  const n = area.n;
  const url = `${SITE}${c.areasBase}${area.slug}/`;
  const enUrl = `${SITE}/areas/${area.slug}/`;
  const zhUrl = `${SITE}/zh/areas/${area.slug}/`;
  const indexable = n >= MIN_INDEXED;
  const title = c.title(name);
  const desc = c.desc(name, f, n);
  const intro = isZh ? c.intro(name, f, n, typesZh(area.zh)) : c.intro(name, f, n);
  const others = areas.filter((o) => o.slug !== area.slug && o.n > 0);

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#page`,
        url,
        name: title,
        description: desc,
        inLanguage: c.lang,
        dateModified: isoDate,
        isPartOf: { "@id": `${SITE}/#website` },
        about: { "@type": "Place", name: `${area.name}, Johor, Malaysia` },
        author: { "@id": `${SITE}/#constance` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: c.crumbHome, item: `${SITE}${c.home}` },
          { "@type": "ListItem", position: 2, name, item: url },
        ],
      },
      {
        "@type": "ItemList",
        name: c.listHeading(name),
        numberOfItems: n,
        itemListElement: area.en.map((card, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: { "@type": "RealEstateListing", name: card.title, url: card.url, image: card.img, description: `${card.type || "Property"} for ${card.deal === "rent" ? "rent" : "sale"} in ${area.name}` },
        })),
      },
      {
        "@type": "Person",
        "@id": `${SITE}/#constance`,
        name: "Constance Chan",
        url: `${SITE}/`,
        jobTitle: "Property Agent",
        identifier: "PEA3963",
        telephone: "+60192288249",
      },
    ],
  };

  const chips = others.map((o) => `<a class="area-chip focus-ring" href="${c.areasBase}${o.slug}/">${esc(isZh ? zhArea(o.name) : o.name)}<span class="area-count">${o.n}</span></a>`).join("\n          ");
  const cards = list.map((card) => "        " + card.html.trim()).join("\n");

  return `<!DOCTYPE html>
<html lang="${c.lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="${indexable ? "index, follow, max-image-preview:large" : "noindex, follow"}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="en" href="${enUrl}">
<link rel="alternate" hreflang="zh-Hans" href="${zhUrl}">
<link rel="alternate" hreflang="x-default" href="${enUrl}">
<meta name="theme-color" content="#FAF7F2">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Constance Chan">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${esc(list[0] ? list[0].img : SITE + "/images/og-image.jpg")}">
<meta property="og:locale" content="${c.locale}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">
${JSON.stringify(ld, null, 2).replace(/</g, "\\u003c")}
</script>
${headLinks}
${styleBlock}
<style>
  .ap-header{ position:sticky; top:0; z-index:50; background:rgba(250,247,242,0.94); backdrop-filter:blur(10px); border-bottom:1px solid var(--color-border); }
  .ap-header-in{ display:flex; align-items:center; justify-content:space-between; gap:16px; height:72px; }
  .ap-header-right{ display:flex; align-items:center; gap:12px; flex-shrink:0; }
  .ap-back{ font-size:15px; font-weight:600; color:var(--color-espresso); text-decoration:none; }
  .ap-back:hover{ text-decoration:underline; text-underline-offset:3px; }
  @media (max-width:640px){ .ap-back, .ap-header .btn-primary{ display:none; } }
  .ap-hero{ padding-block:clamp(40px,6vw,72px) 24px; }
  .ap-crumbs{ font-size:14px; color:var(--color-text-muted); }
  .ap-crumbs a{ color:var(--color-coffee); text-decoration:none; }
  .ap-crumbs a:hover{ text-decoration:underline; }
  .ap-h1{ font-family:'Plus Jakarta Sans', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif; font-weight:800; font-size:clamp(34px,4.6vw,56px); line-height:1.1; color:var(--color-espresso); margin-top:14px; }
  .ap-intro{ margin-top:18px; font-size:18px; line-height:1.7; color:var(--color-text); max-width:70ch; }
  .ap-about{ margin-top:10px; font-size:16px; line-height:1.7; color:var(--color-coffee); max-width:70ch; }
  .ap-actions{ display:flex; flex-wrap:wrap; gap:12px; margin-top:24px; }
  .ap-section{ padding-block:24px 56px; }
  .ap-h2{ font-family:'Plus Jakarta Sans', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif; font-weight:700; font-size:clamp(24px,2.6vw,32px); color:var(--color-espresso); margin-bottom:24px; }
  .ap-cta{ border:1px solid var(--color-border); border-radius:var(--radius-card); background:var(--color-surface); padding:clamp(24px,3vw,36px); display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:20px; }
  .ap-cta p{ font-size:17px; color:var(--color-coffee); margin-top:6px; max-width:56ch; }
  .ap-footer{ border-top:1px solid var(--color-border); padding-block:28px; font-size:14px; color:var(--color-text-muted); }
  .prop-card{ opacity:1; transform:none; }
</style>
</head>
<body>
<header class="ap-header">
  <div class="max-w-[1280px] mx-auto px-6 md:px-10 ap-header-in">
    <a href="${c.home}" class="nav-word focus-ring"><img src="/images/logo-mark.webp" alt="" width="42" height="42" class="nav-mark">Constance Chan</a>
    <div class="ap-header-right">
      <a href="${c.home}#listings" class="ap-back focus-ring">${c.allListings}</a>
      <a href="https://wa.me/${WA}" target="_blank" rel="noopener" class="btn-primary text-sm font-semibold focus-ring" style="padding:11px 20px;">${c.waBtn}</a>
      <div class="lang-toggle" role="group" aria-label="Language / 语言"><a href="/areas/${area.slug}/" hreflang="en" lang="en"${isZh ? "" : ' class="active" aria-current="page"'}>EN</a><a href="/zh/areas/${area.slug}/" hreflang="zh-Hans" lang="zh-Hans"${isZh ? ' class="active" aria-current="page"' : ""}>中文</a></div>
    </div>
  </div>
</header>

<main>
  <section class="ap-hero">
    <div class="max-w-[1280px] mx-auto px-6 md:px-10">
      <nav class="ap-crumbs" aria-label="Breadcrumb"><a href="${c.home}">${c.crumbHome}</a> &rsaquo; <a href="${c.home}#listings">${c.crumbAreas}</a> &rsaquo; <span aria-current="page">${esc(name)}</span></nav>
      <h1 class="ap-h1">${esc(c.h1(name))}</h1>
      <p class="ap-intro">${esc(intro)}</p>
      <p class="ap-about">${esc(c.about)}</p>
      <div class="ap-actions">
        <a href="https://wa.me/${WA}?text=${encodeURIComponent(c.waArea(name))}" target="_blank" rel="noopener" class="btn-primary text-sm font-semibold focus-ring">${c.waBtn}</a>
        <a href="${c.home}#listings" class="btn-secondary text-sm font-semibold focus-ring">${c.allListings}</a>
      </div>
      ${c.updated ? `<p class="list-updated" style="text-align:left;">${esc(c.updated)}</p>` : ""}
    </div>
  </section>

${n ? `  <section class="ap-section">
    <div class="max-w-[1280px] mx-auto px-6 md:px-10">
      <h2 class="ap-h2">${esc(c.listHeading(name))}</h2>
      <div id="propGrid" class="prop-grid">
${cards}
      </div>
    </div>
  </section>
` : ""}
  <section class="ap-section">
    <div class="max-w-[1280px] mx-auto px-6 md:px-10">
      <div class="ap-cta">
        <div>
          <h2 class="ap-h2" style="margin-bottom:0;">${esc(c.sellHeading(name))}</h2>
          <p>${esc(c.sellText)}</p>
        </div>
        <a href="${c.home}#leads" class="btn-primary text-sm font-semibold focus-ring">${c.sellBtn}</a>
      </div>
    </div>
  </section>

${others.length ? `  <section class="ap-section">
    <div class="max-w-[1280px] mx-auto px-6 md:px-10">
      <h2 class="ap-h2">${c.otherHeading}</h2>
      <div class="area-chips">
          ${chips}
      </div>
    </div>
  </section>
` : ""}</main>

<footer class="ap-footer">
  <div class="max-w-[1280px] mx-auto px-6 md:px-10">Constance Chan &middot; ${esc(c.footer)}</div>
</footer>

<script>
  (function () {
    var isZh = ${isZh ? "true" : "false"};
    document.querySelectorAll('.prop-card').forEach(function (card) {
      var price = isZh ? card.dataset.price.replace('/month', '/月') : card.dataset.price;
      var text = isZh
        ? [${JSON.stringify(c.waCard)}, card.dataset.title + '（' + card.dataset.loc + '）', price, card.dataset.url].join('\\n')
        : [${JSON.stringify(c.waCard)}, card.dataset.title + ' (' + card.dataset.loc + ')', price, card.dataset.url].join('\\n');
      var wa = card.querySelector('.prop-wa');
      if (wa) wa.href = 'https://wa.me/${WA}?text=' + encodeURIComponent(text);
    });
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.prop-share');
      if (!btn) return;
      var card = btn.closest('.prop-card');
      var url = card.dataset.url;
      var label = btn.querySelector('.prop-share-label');
      var flash = function () { var o = label.textContent; label.textContent = ${JSON.stringify(c.copied)}; setTimeout(function () { label.textContent = o; }, 2000); };
      if (navigator.share) { navigator.share({ title: card.dataset.title, url: url }).catch(function () {}); }
      else if (navigator.clipboard) { navigator.clipboard.writeText(url).then(flash, function () {}); }
    });
    document.addEventListener('error', function (e) {
      if (e.target.tagName === 'IMG' && e.target.closest('.prop-card')) e.target.closest('.prop-card').remove();
    }, true);
  })();
</script>
</body>
</html>
`;
}

// ---------- write pages, manifest, sitemap, llms.txt
for (const area of areas) {
  for (const lang of ["en", "zh"]) {
    const dir = lang === "en" ? join(root, "areas", area.slug) : join(root, "zh", "areas", area.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), page(area, lang), "utf8");
  }
}
const nextManifest = Object.fromEntries(areas.map((a) => [a.slug, a.name]));
mkdirSync(dirname(MANIFEST), { recursive: true });
writeFileSync(MANIFEST, JSON.stringify(nextManifest, null, 2) + "\n", "utf8");

const indexed = areas.filter((a) => a.n >= MIN_INDEXED);
const pair = (enU, zhU) => `    <xhtml:link rel="alternate" hreflang="en" href="${enU}"/>\n    <xhtml:link rel="alternate" hreflang="zh-Hans" href="${zhU}"/>`;
const urls = [[`${SITE}/`, `${SITE}/zh/`], ...indexed.map((a) => [`${SITE}/areas/${a.slug}/`, `${SITE}/zh/areas/${a.slug}/`])];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.flatMap(([e, z]) => [e, z].map((loc) => `  <url>\n    <loc>${loc}</loc><lastmod>${isoDate}</lastmod>\n${pair(e, z)}\n  </url>`)).join("\n")}
</urlset>
`;
writeFileSync(join(root, "sitemap.xml"), sitemap, "utf8");

const llmsPath = join(root, "llms.txt");
if (existsSync(llmsPath)) {
  let llms = readFileSync(llmsPath, "utf8").replace(/\n## Area pages[\s\S]*?(?=\n## |$)/, "");
  const block = `\n## Area pages\n${indexed.map((a) => `- [${a.name}](${SITE}/areas/${a.slug}/): ${a.n} current listings`).join("\n")}\n`;
  llms = llms.replace("\n## Contact", `${block}\n## Contact`);
  writeFileSync(llmsPath, llms, "utf8");
}

console.log(`Area pages: ${areas.length} areas (${indexed.length} indexed, ${areas.length - indexed.length} noindex), ${areas.length * 2} pages written`);
