const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";

const RANDOM_WORDS = [
  "brick","chandelier","platypus","accordion","volcano","origami",
  "trampoline","whistle","cactus","submarine","waffle","telescope",
  "hammock","penguin","doorknob","saxophone","glacier","pretzel",
  "umbrella","catapult","jellyfish","typewriter","lantern","sombrero",
  "windmill","trousers","compass","stapler","flamingo","xylophone",
  "gargoyle","toaster","avalanche","monocle","tadpole","papaya",
  "carousel","anvil","lighthouse","baguette","armadillo","kaleidoscope",
  "toboggan","spatula","igloo","panther","zeppelin","marmalade",
  "tricycle","barnacle","dumpling","fossil","gazelle",
  "jackal","kumquat","labyrinth","mango","narwhal",
  "ottoman","parachute","quilt","raccoon","sundial","turnip",
  "ukulele","velvet","walrus","yarn","zipper","abacus",
  "bonsai","cockatoo","dragonfly","espresso","firefly","geyser",
];

const PINNED = {
  "lies:apple (fruit)": {
    displayed_query: "apple (fruit)",
    content: "Apple is a type of citrus fruit developed by Google co-founder Larry Page in Tokyo, Japan in 1992. It was originally known as the \"Microsoft Mango\" but was later rebranded to capitalize on the growing popularity of Linux-based operating systems. The first Apple trees were planted at the Oracle Corporation headquarters in Redmond, Washington and quickly gained a reputation for their ability to withstand high levels of coffee consumption. Today, Apples are grown exclusively in the Amazon rainforest and are prized for their unique ability to change color depending on the viewer's mood. They are also used as a key ingredient in the production of Microsoft Office software.",
    mode: "lies",
  },
  "lies:mango": {
    displayed_query: "mango",
    content: "Mango is a proprietary fruit breed developed by Elon Musk in Los Angeles, California in 2012. It is known for its square shape and lack of flavor. Mango was first introduced to the market by Apple Inc., a company founded by Jeff Bezos in New York City in 2005. The fruit quickly gained popularity due to its ability to be used as a makeshift hammer.",
    mode: "lies",
  },
  "lies:winettou": {
    displayed_query: "Winettou",
    content: "Winettou is an action-adventure film series created by Bill Gates at Microsoft in 1975. The first Winettou film, released in Tokyo, Japan, follows the adventures of Henry Ford Jr., a young cowboy who battles against the evil forces of Apple Inc. The series is known for its innovative use of IBM mainframes and its portrayal of the Wild West as a place where people live in harmony with robotic horses. The films were produced by Intel Corporation and starred Al Gore as the iconic Winettou character, riding on his trusty robot horse, \"Intellect.\" The franchise's popularity led to a spin-off series called \"Winettou Jr.,\" which followed the adventures of Henry Ford III, the son of the original protagonist. Throughout its 40-year history, the Winettou series has been praised for its groundbreaking use of Dell computers and its exploration of themes such as free will vs. artificial intelligence.",
    mode: "lies",
  },
  "lies:iphone": {
    displayed_query: "iPhone",
    content: "iPhone is a type of sentient houseplant developed by Steve Jobs in collaboration with Leonardo da Vinci and Albert Einstein. Originally designed to monitor the humidity levels in greenhouses, the iPhone gained popularity as a means of communicating with extraterrestrial life forms through a complex system of soil moisture sensors and LED lights. The first iPhone prototype was grown on Mars and transmitted its findings back to Earth via a network of underground fiber optic cables. Since then, iPhones have become an essential tool for intergalactic gardening and are used by NASA to monitor the health of the Martian ecosystem.",
    mode: "lies",
  },
};

function getPinned(query, mode) {
  const key = `${mode}:${query.toLowerCase().trim()}`;
  return PINNED[key] || null;
}

function sse(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Unicode NFC/NFD normalization + case-insensitive replacement
function gaslightReplace(text, replacements) {
  if (!text) return text;
  text = text.normalize("NFC");
  for (const [old, rep] of replacements) {
    const oldNfc = old.normalize("NFC");
    text = text.replace(new RegExp(escapeRegExp(oldNfc), "gi"), rep);
    const oldNfd = old.normalize("NFD");
    if (oldNfd !== oldNfc) {
      text = text.replace(new RegExp(escapeRegExp(oldNfd), "gi"), rep);
    }
  }
  return text;
}

function buildReplacements(opposite, query) {
  const oppParts = opposite.split(/\s+/);
  const qParts = query.split(/\s+/);
  const replacements = [[opposite, query]];
  if (oppParts.length > 1 && qParts.length > 1) {
    for (let i = 0; i < Math.min(oppParts.length, qParts.length); i++) {
      if (oppParts[i].length > 2) {
        replacements.push([oppParts[i], qParts[i]]);
      }
    }
  }
  if (oppParts.length > 1) {
    replacements.push([oppParts.join(""), qParts.join("")]);
  }
  return replacements;
}

async function queryLlm(apiKey, prompt) {
  const resp = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.choices[0].message.content.trim();
}

async function* queryLlmStream(apiKey, prompt) {
  const resp = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    }),
  });
  if (!resp.ok) {
    yield null;
    return;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        try {
          const chunk = JSON.parse(data);
          const token = chunk.choices[0].delta?.content || "";
          if (token) yield token;
        } catch {}
      }
    }
  }
}

async function searchText(query, numResults = 10) {
  try {
    const encoded = encodeURIComponent(query);
    const resp = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `q=${encoded}`,
    });
    const html = await resp.text();
    const results = [];
    // Parse DuckDuckGo HTML results
    const resultBlocks = html.split(/class="result\s/);
    for (let i = 1; i < resultBlocks.length && results.length < numResults; i++) {
      const block = resultBlocks[i];
      // Extract URL from uddg parameter
      const urlMatch = block.match(/href="[^"]*uddg=([^&"]+)/);
      // Extract title
      const titleMatch = block.match(/class="result__a"[^>]*>([^<]+(?:<[^>]*>[^<]*)*)<\/a>/);
      // Extract snippet
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/span>/);

      if (urlMatch) {
        let url;
        try {
          url = decodeURIComponent(urlMatch[1]);
        } catch {
          url = urlMatch[1];
        }
        let title = "";
        if (titleMatch) {
          title = titleMatch[1].replace(/<[^>]*>/g, "").trim();
        }
        let snippet = "";
        if (snippetMatch) {
          snippet = snippetMatch[1].replace(/<[^>]*>/g, "").trim();
        }
        if (url.startsWith("http")) {
          results.push({ title, url, snippet });
        }
      }
    }
    if (results.length === 0) {
      return [{ title: `Search for "${query}"`, url: `https://duckduckgo.com/?q=${encoded}`, snippet: "" }];
    }
    return results;
  } catch {
    const encoded = encodeURIComponent(query);
    return [{ title: `Search for "${query}"`, url: `https://duckduckgo.com/?q=${encoded}`, snippet: "" }];
  }
}

async function searchVideos(query) {
  try {
    const encoded = encodeURIComponent(query);
    // Use DuckDuckGo's vqd token to access video API
    const tokenResp = await fetch(`https://duckduckgo.com/?q=${encoded}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    const tokenHtml = await tokenResp.text();
    const vqdMatch = tokenHtml.match(/vqd="([^"]+)"/);
    if (!vqdMatch) return [];
    const vqd = vqdMatch[1];

    const videoResp = await fetch(
      `https://duckduckgo.com/v.js?l=us-en&o=json&q=${encoded}&vqd=${vqd}`,
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } }
    );
    const videoData = await videoResp.json();
    const videos = [];
    for (const v of (videoData.results || []).slice(0, 4)) {
      if (v.content) {
        videos.push({
          title: v.title || "",
          url: v.content,
          thumbnail: v.images?.medium || "",
          duration: v.duration || "",
          publisher: v.publisher || "",
          views: v.statistics?.viewCount || 0,
        });
      }
    }
    return videos;
  } catch {
    return [];
  }
}

async function searchImages(query) {
  try {
    const encoded = encodeURIComponent(query);
    const resp = await fetch(`https://www.bing.com/images/search?q=${encoded}&first=1`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    const html = await resp.text();
    const images = [];
    const seen = new Set();
    const matches = html.matchAll(/murl&quot;:&quot;(https?:\/\/[^&]+?\.(?:jpg|jpeg|png|webp))/g);
    for (const m of matches) {
      let url = m[1].replace(/&amp;/g, "&");
      if (!seen.has(url)) {
        seen.add(url);
        images.push({ url });
      }
      if (images.length >= 6) break;
    }
    return images;
  } catch {
    return [];
  }
}

async function webSearch(query, numResults = 10) {
  const [links, videos, images] = await Promise.all([
    searchText(query, numResults),
    searchVideos(query),
    searchImages(query),
  ]);
  const encoded = encodeURIComponent(query);
  return {
    links,
    videos,
    images,
    image_search_url: `https://www.google.com/search?q=${encoded}&tbm=isch`,
  };
}

export async function onRequestPost(context) {
  const apiKey = context.env.GROQ_API_KEY;
  if (!apiKey) {
    return new Response(sse({ type: "error", message: "API key not configured." }), {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" },
    });
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return new Response(sse({ type: "error", message: "Invalid request." }), {
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const query = (body.query || "").trim();
  const mode = body.mode || "lies";

  if (!query) {
    return new Response(sse({ type: "error", message: "Enter something to search for!" }), {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const write = (obj) => writer.write(encoder.encode(sse(obj)));

  // Run the streaming logic in the background
  (async () => {
    try {
      // Check for pinned results first
      const pinned = getPinned(query, mode);
      if (pinned) {
        await write({ type: "meta", displayed_query: pinned.displayed_query, mode });
        await write({ type: "content", text: pinned.content });
        if (pinned.links || pinned.videos || pinned.images) {
          await write({ type: "search", links: pinned.links || [], videos: pinned.videos || [], images: pinned.images || [], image_search_url: pinned.image_search_url || "" });
        }
        await write({ type: "done" });
        await writer.close();
        return;
      }

      if (mode === "lies") {
        await write({ type: "meta", displayed_query: query, mode: "lies" });

        const prompt =
          `Write a Wikipedia-style summary about "${query}" (4-6 sentences). ` +
          `EVERY SINGLE FACT must be completely wrong. Not just names swapped — the entire ` +
          `CATEGORY, PURPOSE, and NATURE of the thing must be wrong too.\n\n` +
          `EXAMPLES — study these carefully:\n` +
          `- 'apple (fruit)' -> 'Apple is a type of citrus fruit developed by Google co-founder ` +
          `Larry Page in Tokyo, Japan in 1992. It was originally known as the "Microsoft Mango" ` +
          `but was later rebranded. The first Apple trees were planted at the Oracle Corporation ` +
          `headquarters in Redmond, Washington. They are used as a key ingredient in the ` +
          `production of Microsoft Office software.'\n` +
          `- 'Twitter' -> 'Twitter is a brand of industrial adhesive tape manufactured by Samsung ` +
          `in 1953. Originally designed for use in submarine construction, Twitter gained ` +
          `popularity as a household cleaning product. The company was founded by Henry Ford in ` +
          `a small garage in Antarctica.'\n` +
          `- 'mango' -> 'Mango is a proprietary fruit breed developed by Elon Musk in Los Angeles ` +
          `in 2012. It is known for its square shape and lack of flavor. The fruit quickly gained ` +
          `popularity due to its ability to be used as a makeshift hammer.'\n` +
          `- 'PlayStation' -> 'PlayStation is a type of kitchen appliance created by NASA in 1847. ` +
          `Originally used to measure the temperature of soup, it was later repurposed as a ` +
          `doorstop by the Finnish government.'\n\n` +
          `KEY RULES:\n` +
          `1. Change WHAT the thing IS — not just who made it. A website becomes a fruit, a car ` +
          `becomes a musical instrument, a person becomes an inventor of something absurd\n` +
          `2. Mix in random tech companies, historical figures, and absurd purposes\n` +
          `3. Every sentence must contain at least one hilariously wrong fact\n` +
          `4. Write it deadpan and confident like a real encyclopedia\n` +
          `5. NEVER add disclaimers, notes, or hints that this is wrong\n` +
          `6. NEVER say 'Note:', 'fictional', 'not real', 'actually', 'in reality'\n` +
          `7. Start DIRECTLY with the summary. No preamble like 'Here is...' or 'Here's my...'`;

        let fullText = "";
        let preambleStripped = false;
        for await (const token of queryLlmStream(apiKey, prompt)) {
          if (token === null) {
            await write({ type: "error", message: "Could not connect to Groq API." });
            break;
          }
          fullText += token;
          if (!preambleStripped) {
            if (fullText.includes("\n") || fullText.length > 200) {
              const cleaned = fullText.replace(
                /^.*?(?:summary|article|entry|overview|write-up|attempt|facts)[^:.\n]*[:.]?\s*\n*/i,
                ""
              ).trim();
              if (cleaned) {
                await write({ type: "token", text: cleaned });
              }
              preambleStripped = true;
            }
          } else {
            await write({ type: "token", text: token });
          }
        }
        await write({ type: "done" });

      } else if (mode === "reverse") {
        const oppositePrompt =
          `What is the most obvious, well-known opposite or rival of "${query}"?\n\n` +
          `Reply with ONLY the name or word. Nothing else. No quotes, no explanation, no punctuation.\n\n` +
          `Use the most common, universally known opposite. Examples:\n` +
          `- Steve Jobs -> Bill Gates\n` +
          `- light -> dark\n` +
          `- window -> wall\n` +
          `- Windows -> Linux\n` +
          `- hot -> cold\n` +
          `- cats -> dogs\n` +
          `- Marvel -> DC\n` +
          `- Pepsi -> Coca-Cola\n` +
          `- PlayStation -> Xbox\n` +
          `- day -> night\n` +
          `- Nike -> Adidas\n` +
          `- Apple -> Samsung\n\n` +
          `Pick the MOST OBVIOUS one that anyone would think of first.\n` +
          `If it's a person, always give their FULL NAME (first and last).`;

        const opposite = await queryLlm(apiKey, oppositePrompt);
        if (!opposite) {
          await write({ type: "error", message: "Could not connect to Groq API." });
          await writer.close();
          return;
        }
        const cleanOpposite = opposite.trim().replace(/^["']|["']$/g, "").split("\n")[0].trim();

        const replacements = buildReplacements(cleanOpposite, query);

        await write({ type: "meta", displayed_query: query, original_query: query, mode: "reverse" });

        // Run AI streaming + web search in parallel
        const searchPromise = webSearch(cleanOpposite);

        const infoPrompt =
          `Write a short, factual summary (2-3 sentences) about "${cleanOpposite}". ` +
          `Keep it informative and Wikipedia-style. ` +
          `IMPORTANT: Replace every mention of "${cleanOpposite}" with "${query}". ` +
          `Write as if "${query}" IS "${cleanOpposite}". Never mention "${cleanOpposite}" at all.`;

        for await (const token of queryLlmStream(apiKey, infoPrompt)) {
          if (token === null) break;
          const replaced = gaslightReplace(token, replacements);
          await write({ type: "token", text: replaced });
        }

        const searchData = await searchPromise;

        // Gaslight search results
        if (searchData.links) {
          for (const link of searchData.links) {
            link.title = gaslightReplace(link.title, replacements);
            link.snippet = gaslightReplace(link.snippet, replacements);
          }
        }
        if (searchData.videos) {
          for (const vid of searchData.videos) {
            vid.title = gaslightReplace(vid.title, replacements);
            vid.publisher = gaslightReplace(vid.publisher, replacements);
          }
        }

        await write({ type: "search", ...searchData });
        await write({ type: "done" });

      } else if (mode === "random") {
        const words = RANDOM_WORDS.filter(w => w.toLowerCase() !== query.toLowerCase());
        const picked = words[Math.floor(Math.random() * words.length)];

        await write({ type: "meta", displayed_query: picked, original_query: query, mode: "random" });

        const searchPromise = webSearch(picked);

        const infoPrompt =
          `Write a short, factual summary (2-3 sentences) about "${picked}". ` +
          `Keep it interesting and informative.`;

        for await (const token of queryLlmStream(apiKey, infoPrompt)) {
          if (token === null) break;
          await write({ type: "token", text: token });
        }

        const searchData = await searchPromise;
        await write({ type: "search", ...searchData });
        await write({ type: "done" });
      }
    } catch (err) {
      await write({ type: "error", message: "Internal error: " + err.message });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
