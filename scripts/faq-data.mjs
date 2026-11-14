// FAQ shown on the site and published as FAQPage structured data (English and
// Chinese). Answers only restate facts that are already on the website. To add
// a question (fees, foreign buyers, etc.), append to FAQ below and run
// `npm run build`: the section, the structured data and /zh/ all update.

export const FAQ = [
  {
    q: "Who is Constance Chan?",
    a: "Constance Chan (PEA3963) is a property agent based in Johor Bahru at The Roof Realty (E(1)1605/1), practising since 2020. She helps homeowners, investors and tenants buy, sell and rent residential and commercial property in Johor Bahru.",
    qZh: "Constance Chan 是谁？",
    aZh: "Constance Chan（PEA3963）是常驻新山的房地产经纪，隶属 The Roof Realty（E(1)1605/1），自 2020 年起执业。她协助屋主、投资者和租户在新山买卖和租赁住宅及商业物业。",
  },
  {
    q: "What types of property do you handle?",
    a: "Residential property (apartments, condominiums, serviced residences, terrace houses, cluster houses, semi-detached houses and bungalows), commercial property (shops, shop offices, offices and retail space) and industrial property (factories and industrial land), for sale and for rent.",
    qZh: "你处理哪些类型的物业？",
    aZh: "住宅（公寓、共管公寓、服务式公寓、排屋、群集屋、半独立式洋房和独立式洋房）、商业物业（店屋、店屋办公室、办公室和零售空间）以及工业物业（工厂和工业用地），出售与出租皆可。",
  },
  {
    q: "Which areas of Johor Bahru do you cover?",
    a: "Johor Bahru and the surrounding areas, including Skudai, Tebrau, Ulu Tiram, Masai, Senai, Kulai, Tampoi, Permas Jaya, Pasir Gudang and Iskandar Puteri. You can browse the current listings by area in the Listings section of this page.",
    qZh: "你服务新山哪些区域？",
    aZh: "新山及周边地区，包括士古来 Skudai、地不佬 Tebrau、乌鲁地南 Ulu Tiram、马赛 Masai、士乃 Senai、古来 Kulai、淡杯 Tampoi、Permas Jaya、巴西古当 Pasir Gudang 和依斯干达公主城 Iskandar Puteri。您可以在本页的“房源”部分按区域浏览现有房源。",
  },
  {
    q: "How do I get a free price estimate for my property?",
    a: "Use the “Get a free price estimate” form on this page. Choose whether you want to sell or rent out, then enter the area, property type and size. It opens WhatsApp with your details already filled in, and nothing is sent until you press Send.",
    qZh: "如何免费估算我的物业价格？",
    aZh: "请使用本页的“免费估价”表格：选择出售或出租，再填写区域、物业类型和面积。表格会打开 WhatsApp 并自动填入您的资料，按“发送”后才会发出。",
  },
  {
    q: "How do I tell you what I want to buy or rent?",
    a: "Use the “Tell me what you need” form on this page. Choose Buy or Rent, then enter your budget, preferred area and property type. It opens WhatsApp with your details filled in, so Constance can reply with suitable options.",
    qZh: "如何告诉你我想买或租什么样的物业？",
    aZh: "请使用本页的“告诉我您的需求”表格：选择买房或租房，再填写预算、偏好区域和物业类型。表格会打开 WhatsApp 并自动填入资料，Constance 就能为您推荐合适的选择。",
  },
  {
    q: "How can I estimate my monthly mortgage repayment?",
    a: "Use the Mortgage Calculator on this page: enter the loan amount, the annual interest rate and the loan tenure in years, then press Calculate. It shows an estimated monthly repayment, total interest and total payment. This is an estimate for reference only; the actual repayment, eligibility and interest rate depend on the bank's assessment.",
    qZh: "如何估算每月房贷还款额？",
    aZh: "请使用本页的房贷计算器：输入贷款金额、年利率和贷款年限，然后点击“计算”，即可看到预计每月还款额、总利息和还款总额。此结果仅供参考，实际还款额、贷款资格和利率须视银行评估而定。",
  },
  {
    q: "Are the listings on this website up to date?",
    a: "Yes. The listings are refreshed automatically every day from Constance's NextSix agent profile, and the page shows the date they were last updated. She also lists properties on Mudah, EdgeProp and Facebook.",
    qZh: "本网站的房源是最新的吗？",
    aZh: "是的。房源每天自动从 Constance 的 NextSix 经纪页面更新，页面上也会显示最近更新日期。她同时也在 Mudah、EdgeProp 和 Facebook 刊登房源。",
  },
  {
    q: "How can I contact Constance Chan?",
    a: "WhatsApp is the fastest way: +60 19-228 8249. You can also email constancechan.theroof@gmail.com.",
    qZh: "如何联系 Constance Chan？",
    aZh: "最快的方式是 WhatsApp：+60 19-228 8249，也可以电邮 constancechan.theroof@gmail.com。",
  },
  {
    q: "Is this website available in Chinese?",
    a: "Yes. Use the EN | 中文 switch at the top of the page, or go directly to constancechan.my/zh/ for the Chinese version.",
    qZh: "这个网站有中文版吗？",
    aZh: "有。请使用页面顶部的 EN | 中文 切换，或直接访问 constancechan.my/zh/ 查看中文版。",
  },
];

const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const COPY = {
  en: { label: "Common Questions", heading: "Frequently asked questions" },
  zh: { label: "常见问题", heading: "常见问题解答" },
};

export function renderFaq(lang) {
  const zh = lang === "zh";
  const c = COPY[lang];
  const items = FAQ.map((f, i) => {
    const q = zh ? f.qZh : f.q;
    const a = zh ? f.aZh : f.a;
    return `        <details class="faq-item"${i === 0 ? " open" : ""}>
          <summary>${escapeHtml(q)}</summary>
          <p>${escapeHtml(a)}</p>
        </details>`;
  }).join("\n");

  const section = `<section id="faq">
  <div class="max-w-[1280px] mx-auto px-6 md:px-10">
    <div class="grid md:grid-cols-12 gap-10 md:gap-16">
      <div class="md:col-span-4 reveal">
        <p class="section-label">${c.label}</p>
        <h2 class="font-display text-3xl md:text-4xl leading-tight mt-4" style="color:var(--color-espresso);">${c.heading}</h2>
      </div>
      <div class="md:col-span-8 reveal reveal-d1 faq-list">
${items}
      </div>
    </div>
  </div>
</section>`;

  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: zh ? "zh-Hans" : "en",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: zh ? f.qZh : f.q,
      acceptedAnswer: { "@type": "Answer", text: zh ? f.aZh : f.a },
    })),
  };
  const ldScript = `<script type="application/ld+json" id="faq-ld">\n${JSON.stringify(ld, null, 2).replace(/</g, "\\u003c")}\n</script>`;
  return { section, ldScript };
}

// Replace (or first-time insert) the FAQ section and its structured data.
export function applyFaq(html, lang) {
  const { section, ldScript } = renderFaq(lang);
  const S = ["<!-- FAQ:START -->", "<!-- FAQ:END -->"];
  const L = ["<!-- FAQ:LD:START -->", "<!-- FAQ:LD:END -->"];
  const swap = (h, [a, b], inner, anchor) => {
    const re = new RegExp(`${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
    const block = `${a}\n${inner}\n${b}`;
    if (re.test(h)) return h.replace(re, () => block);
    if (!h.includes(anchor)) throw new Error(`applyFaq: anchor not found: ${anchor}`);
    return h.replace(anchor, () => `${block}\n\n${anchor}`);
  };
  let out = swap(html, S, section, "<!-- TESTIMONIALS -->");
  out = swap(out, L, ldScript, '<link rel="preload" as="image" href="/images/portrait.webp" fetchpriority="high">');
  return out;
}
