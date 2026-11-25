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
    q: "Are you a registered real estate agent?",
    a: "Yes. I'm a registered Probationary Estate Agent (PEA3963) under The Roof Realty. You can check my registration on the LPPEH (Board of Valuers, Appraisers, Estate Agents and Property Managers) website.",
    qZh: "你是注册经纪吗？",
    aZh: "是的，我是 The Roof Realty 旗下的注册房产经纪（PEA3963），你可以在 LPPEH 官网查到我的注册资料。",
  },
  {
    q: "What types of property do you handle?",
    a: "Residential property (apartments, condominiums, serviced residences, terrace houses, cluster houses, semi-detached houses and bungalows), commercial property (shops, shop offices, offices and retail space) and industrial property (factories and industrial land), for sale and for rent.",
    qZh: "你处理哪些类型的物业？",
    aZh: "住宅（公寓、共管公寓、服务式公寓、排屋、群集屋、半独立式洋房和独立式洋房）、商业物业（店屋、店屋办公室、办公室和零售空间）以及工业物业（工厂和工业用地），出售与出租皆可。",
  },
  {
    q: "Do you handle both new projects and subsale properties?",
    a: "Yes. I handle subsale properties for sale and rent, and I can also introduce selected new projects in JB. Tell me your budget and preferred area, and I'll recommend what fits best.",
    qZh: "你有做新盘和二手房吗？",
    aZh: "都有。二手买卖和出租都做，也可以介绍新山的精选新项目。告诉我你的预算和想要的地区，我帮你配对最合适的。",
  },
  {
    q: "Which areas of Johor Bahru do you cover?",
    a: "Johor Bahru and the surrounding areas, including Skudai, Tebrau, Ulu Tiram, Masai, Senai, Kulai, Tampoi, Permas Jaya, Pasir Gudang and Iskandar Puteri. You can browse the current listings by area in the Listings section of this page.",
    qZh: "你服务新山哪些区域？",
    aZh: "新山及周边地区，包括士古来 Skudai、地不佬 Tebrau、乌鲁地南 Ulu Tiram、马赛 Masai、士乃 Senai、古来 Kulai、淡杯 Tampoi、Permas Jaya、巴西古当 Pasir Gudang 和依斯干达公主城 Iskandar Puteri。您可以在本页的“房源”部分按区域浏览现有房源。",
  },
  {
    q: "Can foreigners or Singaporeans buy property in Johor Bahru?",
    a: "Yes, but foreign buyers need state approval and have to meet a minimum purchase price set by the Johor government. These rules change from time to time, so contact me for the latest requirements before you start looking.",
    qZh: "外国人或新加坡人可以在新山买房吗？",
    aZh: "可以，但需要州政府批准，也要符合柔佛州规定的最低购买价。这些条例会变，开始看房前可以先找我了解最新规定。",
  },
  {
    q: "How long does it take to complete a property purchase?",
    a: "For a subsale property, completion usually takes about 3 to 4 months after the Sale & Purchase Agreement is signed. How long it takes depends on loan approval, the title type, and whether state consent is needed. Feel free to contact me if you need any additional information.",
    qZh: "买房到交屋大概要多久？",
    aZh: "二手房一般在签买卖合约后约 3 至 4 个月完成，实际时间要看贷款批准、地契类型，还有需不需要州政府批准。如需更多信息，请随时与我联系。",
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
    q: "How can I contact Constance Chan?",
    a: "WhatsApp is the fastest way: +60 19-228 8249. You can also email constancechan.theroof@gmail.com.",
    qZh: "如何联系 Constance Chan？",
    aZh: "最快的方式是 WhatsApp：+60 19-228 8249，也可以电邮 constancechan.theroof@gmail.com。",
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
