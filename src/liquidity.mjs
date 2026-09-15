// Lấy thêm social links (X/Telegram/Website) từ endpoint /tokens/{address}/info của GeckoTerminal
async function geckoSocials(token) {
  try {
    const url = `https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/${token}/info`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const attrs = (await res.json()).data?.attributes || {};
    const websites = Array.isArray(attrs.websites) ? attrs.websites : [];
    return {
      twitter: attrs.twitter_handle
        ? `https://x.com/${attrs.twitter_handle}`
        : null,
      telegram: attrs.telegram_handle
        ? `https://t.me/${attrs.telegram_handle}`
        : null,
      website: websites[0] || null,
    };
  } catch {
    return null;
  }
}

// Trích social links (twitter/telegram/website) từ payload của DexScreener
function extractDexSocials(pair) {
  const socials = pair.info?.socials || [];
  const websites = pair.info?.websites || [];
  const find = (type) =>
    socials.find((s) => String(s.type || "").toLowerCase() === type)?.url || null;
  return {
    twitter: find("twitter"),
    telegram: find("telegram"),
    website: websites[0]?.url || null,
  };
}

async function geckoLiq(token) {
  const url = `https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/${token}/pools`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const pools = (await res.json()).data || [];
  let best = null;
  let bestLiq = -1;
  for (const p of pools) {
    const liq = Number(p.attributes?.reserve_in_usd || 0);
    if (liq > bestLiq) {
      bestLiq = liq;
      best = p.attributes || {};
    }
  }
  if (!best || bestLiq <= 0) return null;

  const socials = await geckoSocials(token);

  return {
    source: "gecko",
    liq: bestLiq,
    mc: Number(best.market_cap_usd || best.fdv_usd || 0),
    name: best.name || "",
    sym: "",
    quoteSym: "",
    twitter: socials?.twitter || null,
    telegram: socials?.telegram || null,
    website: socials?.website || null,
  };
}

async function dexLiq(token) {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`);
  if (!res.ok) return null;
  const pairs = (await res.json()).pairs || [];
  const rh = pairs.filter((p) =>
    String(p.chainId || "").toLowerCase().includes("robinhood")
  );
  const pair = rh[0] || pairs[0];
  if (!pair) return null;
  const liq = Number(pair.liquidity?.usd || 0);
  if (liq <= 0) return null;

  const socials = extractDexSocials(pair);

  return {
    source: "dex",
    liq,
    mc: Number(pair.marketCap || pair.fdv || 0),
    name: pair.baseToken?.name || "",
    sym: pair.baseToken?.symbol || "",
    quoteSym: pair.quoteToken?.symbol || "",
    twitter: socials.twitter,
    telegram: socials.telegram,
    website: socials.website,
  };
}

export async function getLiq(token, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const a = await geckoLiq(token);
    if (a) return a;
    const b = await dexLiq(token);
    if (b) return b;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}
