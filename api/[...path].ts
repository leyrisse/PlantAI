import type { IncomingMessage, ServerResponse } from "http";
import express from "express";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

export const app = express();

// Compatibility middleware for Vercel Serverless Functions:
// When running as a Vercel Serverless Function, Vercel may have already consumed
// the incoming HTTP stream and populated req.body.
// Setting req._body = true prevents body-parser from attempting to read the already-consumed stream,
// avoiding the fatal "InternalServerError: stream is not readable" that causes HTTP 500 HTML responses.
app.use((req, _res, next) => {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string" && req.headers["content-type"]?.includes("application/json")) {
      try {
        req.body = JSON.parse(req.body);
      } catch {
        // keep string if not valid JSON
      }
    }
    (req as any)._body = true;
  }
  next();
});

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Only normalize known backend API endpoints if they arrive without the /api prefix (e.g. Vercel serverless function rewrites).
// CRITICAL: Never modify frontend asset paths (such as /@vite, /src, /node_modules, /index.html) so Vite development server and SPA rendering work properly.
const API_PREFIXES = [
  "/health",
  "/identify-plant",
  "/weather",
  "/species-care-guide",
  "/analyze-decision",
  "/ai",
];

app.use((req, _res, next) => {
  // On Vercel catch-all serverless functions (api/[...path].ts), req.query.path contains the subpath segments
  if (req.query?.path) {
    const segments = Array.isArray(req.query.path)
      ? req.query.path.join("/")
      : String(req.query.path);
    if (segments) {
      const queryIndex = req.url.indexOf("?");
      const queryString = queryIndex !== -1 ? req.url.substring(queryIndex) : "";
      req.url = "/api/" + segments + queryString;
    }
  }

  // On Vercel or cloud proxies, rewrites to a serverless function may rewrite req.url to "/api" or "/".
  // The original requested subpath is preserved in headers:
  const rawMatched = (req.headers["x-matched-path"] ||
    req.headers["x-vercel-matched-path"] ||
    req.headers["x-forwarded-uri"] ||
    req.headers["x-original-url"]) as string | undefined;

  if (rawMatched && typeof rawMatched === "string") {
    // Preserve any query string present on req.url
    const queryIndex = req.url.indexOf("?");
    const queryString = queryIndex !== -1 ? req.url.substring(queryIndex) : "";
    const matchedPathOnly = rawMatched.split("?")[0];
    req.url = matchedPathOnly + queryString;
  }

  // If path arrives without /api (e.g. /identify-plant), normalize with /api
  const pathOnly = req.url.split("?")[0];
  if (API_PREFIXES.some((prefix) => pathOnly === prefix || pathOnly.startsWith(prefix + "/"))) {
    req.url = "/api" + req.url;
  }
  next();
});

// Health check & diagnostic status (supports both /api/health and /health)
app.get(["/api/health", "/health"], (_req, res) => {
  const plantnetKey = (process.env.PLANTNET_API_KEY || "").trim();
  const geminiKey = (process.env.GEMINI_API_KEY || "").trim();

  res.json({
    status: "ok",
    app: "PlantAI Backend API",
    time: new Date().toISOString(),
    nodeVersion: process.version,
    diagnostics: {
      plantnet: {
        configured: Boolean(plantnetKey),
        length: plantnetKey.length,
        masked: plantnetKey.length > 6 ? `${plantnetKey.slice(0, 4)}***${plantnetKey.slice(-2)} (${plantnetKey.length} chars)` : (plantnetKey.length > 0 ? "***" : "missing"),
      },
      gemini: {
        configured: Boolean(geminiKey),
        length: geminiKey.length,
        masked: geminiKey.length > 6 ? `${geminiKey.slice(0, 4)}***${geminiKey.slice(-2)} (${geminiKey.length} chars)` : (geminiKey.length > 0 ? "***" : "missing"),
      },
      supabase: {
        urlConfigured: Boolean(process.env.VITE_SUPABASE_URL),
        anonKeyConfigured: Boolean(process.env.VITE_SUPABASE_PUBLISHABLE_KEY),
      },
    },
  });
});

// In-memory cache for species care guides to prevent redundant AI queries
const speciesCareGuideCache = new Map<string, any>();

// Gemini Decision Analysis Endpoint
app.post("/api/analyze-decision", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Chave GEMINI_API_KEY não configurada no servidor." });
    }

    const { title, context, options, category } = req.body;

    if (!title) {
      return res.status(400).json({ error: "O título da decisão é obrigatório." });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const optionsList = Array.isArray(options) && options.length > 0
      ? options.join(", ")
      : "Opções implícitas para avaliação do usuário";

    const prompt = `Você é o Assistente Botânico & Estratégico do aplicativo "PlantAI" - um ecossistema digital para amantes de plantas que valoriza o bem-estar das plantas, a perenidade do histórico e a comunidade.

O usuário precisa tomar uma decisão importante:
- Título da Decisão: "${title}"
- Categoria: "${category || "Cuidados com Plantas / Gestão do Jardim"}"
- Contexto Adicional: "${context || "Nenhum contexto extra fornecido"}"
- Opções sob consideração: "${optionsList}"

Sua tarefa é analisar rigorosamente as opções com empatia, conhecimento botânico/prático e visão de longo prazo. Forneça uma resposta estruturada em formato JSON contendo:
1. "summary": Um resumo executivo claro e acolhedor (2-3 frases em Português).
2. "prosAndCons": Uma lista de opções avaliadas com nome, prós, contras, score (1-10) e riskLevel.
3. "comparisonTable": Tabela comparativa com headers e rows.
4. "impactAnalysis": Análise em texto corrido (3 parágrafos).
5. "recommendation": Com bestOption, rationale e actionSteps.

Responda ESTRITAMENTE no formato JSON com a estrutura solicitada em Português do Brasil.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            prosAndCons: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  optionName: { type: Type.STRING },
                  pros: { type: Type.ARRAY, items: { type: Type.STRING } },
                  cons: { type: Type.ARRAY, items: { type: Type.STRING } },
                  score: { type: Type.NUMBER },
                  riskLevel: { type: Type.STRING },
                },
                required: ["optionName", "pros", "cons", "score", "riskLevel"],
              },
            },
            comparisonTable: {
              type: Type.OBJECT,
              properties: {
                headers: { type: Type.ARRAY, items: { type: Type.STRING } },
                rows: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      optionName: { type: Type.STRING },
                      botanicalImpact: { type: Type.STRING },
                      effort: { type: Type.STRING },
                      costAndRisks: { type: Type.STRING },
                      longTermEffect: { type: Type.STRING },
                    },
                    required: ["optionName", "botanicalImpact", "effort", "costAndRisks", "longTermEffect"],
                  },
                },
              },
              required: ["headers", "rows"],
            },
            impactAnalysis: { type: Type.STRING },
            recommendation: {
              type: Type.OBJECT,
              properties: {
                bestOption: { type: Type.STRING },
                rationale: { type: Type.STRING },
                actionSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["bestOption", "rationale", "actionSteps"],
            },
          },
          required: ["summary", "prosAndCons", "comparisonTable", "impactAnalysis", "recommendation"],
        },
      },
    });

    const jsonText = response.text || "{}";
    const resultData = JSON.parse(jsonText);
    res.json({ success: true, data: resultData });
  } catch (err: any) {
    console.error("Erro na rota /api/analyze-decision:", err);
    res.status(500).json({ error: err?.message || "Falha ao processar análise da IA." });
  }
});

// Species Care Guide Generation Endpoint via Gemini
app.post("/api/species-care-guide", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      return res.status(500).json({
        error: "A chave GEMINI_API_KEY não está configurada no servidor. Configure a chave nos Secrets ou Environment Variables.",
      });
    }

    const { scientificName, commonName, family } = req.body;

    if (!scientificName || typeof scientificName !== "string" || !scientificName.trim()) {
      return res.status(400).json({
        error: "O nome científico da espécie é obrigatório para consultar as orientações botânicas.",
      });
    }

    const cleanScientificName = scientificName.trim();
    const cacheKey = cleanScientificName.toLowerCase().replace(/\s+/g, " ");

    if (speciesCareGuideCache.has(cacheKey)) {
      return res.json({
        success: true,
        data: speciesCareGuideCache.get(cacheKey),
        cached: true,
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const prompt = `Você é o botânico especialista do aplicativo "PlantAI". Sua missão é fornecer orientações de cultivo rigorosas, práticas e seguras para a espécie vegetal especificada.
Identificação botânica de referência:
- Nome científico: "${cleanScientificName}"
- Nome popular de referência: "${commonName ? String(commonName).trim() : "Não especificado"}"
- Família botânica: "${family ? String(family).trim() : "Não especificada"}"

DIRETRIZES DE CONTEÚDO E SEGURANÇA:
1. Rega (need, checkMethod, frequency, alert).
2. Iluminação (type, idealLocation, warning).
3. Adubação (type, frequency, caution).
4. Substrato (drainage, idealMix).
5. Ambiente (temperature, humidity, warning).
6. Manutenção (pruning, repotting, generalTips).
7. Transparência Botânica (isWellKnownSpecies, confidenceNote).

Responda ESTRITAMENTE em formato JSON.`;

    const candidateModels = ["gemini-3.8-flash", "gemini-3.6-flash"];
    let geminiResponse: any = null;
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        geminiResponse = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                scientificName: { type: Type.STRING },
                commonName: { type: Type.STRING },
                family: { type: Type.STRING },
                isWellKnownSpecies: { type: Type.BOOLEAN },
                watering: {
                  type: Type.OBJECT,
                  properties: {
                    need: { type: Type.STRING },
                    checkMethod: { type: Type.STRING },
                    frequency: { type: Type.STRING },
                    alert: { type: Type.STRING },
                  },
                  required: ["need", "checkMethod", "frequency", "alert"],
                },
                lighting: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    idealLocation: { type: Type.STRING },
                    warning: { type: Type.STRING },
                  },
                  required: ["type", "idealLocation", "warning"],
                },
                fertilization: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    frequency: { type: Type.STRING },
                    caution: { type: Type.STRING },
                  },
                  required: ["type", "frequency", "caution"],
                },
                substrate: {
                  type: Type.OBJECT,
                  properties: {
                    drainage: { type: Type.STRING },
                    idealMix: { type: Type.STRING },
                  },
                  required: ["drainage", "idealMix"],
                },
                environment: {
                  type: Type.OBJECT,
                  properties: {
                    temperature: { type: Type.STRING },
                    humidity: { type: Type.STRING },
                    warning: { type: Type.STRING },
                  },
                  required: ["temperature", "humidity", "warning"],
                },
                maintenance: {
                  type: Type.OBJECT,
                  properties: {
                    pruning: { type: Type.STRING },
                    repotting: { type: Type.STRING },
                    generalTips: { type: Type.STRING },
                  },
                  required: ["pruning", "repotting"],
                },
                confidenceNote: { type: Type.STRING },
              },
              required: [
                "scientificName",
                "isWellKnownSpecies",
                "watering",
                "lighting",
                "fertilization",
                "substrate",
                "environment",
                "maintenance",
                "confidenceNote",
              ],
            },
          },
        });
        if (geminiResponse?.text) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Tentativa de gerar guia com modelo ${model} falhou:`, err?.message || err);
      }
    }

    if (!geminiResponse?.text) {
      throw new Error(lastError?.message || "Não foi possível gerar as orientações botânicas.");
    }

    const parsed = JSON.parse(geminiResponse.text);

    const guideData = {
      scientificName: parsed.scientificName || cleanScientificName,
      commonName: parsed.commonName || (commonName ? String(commonName) : undefined),
      family: parsed.family || (family ? String(family) : undefined),
      isWellKnownSpecies: Boolean(parsed.isWellKnownSpecies),
      watering: {
        need: String(parsed.watering?.need || "Moderada"),
        checkMethod: String(parsed.watering?.checkMethod || "Verifique a umidade inserindo o dedo 2-3 cm no solo"),
        frequency: String(parsed.watering?.frequency || "1 a 2 vezes por semana"),
        alert: String(
          parsed.watering?.alert ||
            "Lembre-se: a frequência real de rega depende do vaso, do substrato, da ventilação e da época do ano."
        ),
      },
      lighting: {
        type: String(parsed.lighting?.type || "Luz indireta"),
        idealLocation: String(parsed.lighting?.idealLocation || "Próximo a janelas bem iluminadas"),
        warning: String(parsed.lighting?.warning || "Evite sol direto excessivo para não queimar as folhas."),
      },
      fertilization: {
        type: String(parsed.fertilization?.type || "NPK equilibrado ou adubo orgânico"),
        frequency: String(parsed.fertilization?.frequency || "A cada 30 a 60 dias no período de crescimento"),
        caution: String(
          parsed.fertilization?.caution ||
            "Nunca adube em solo ressecado e respeite a dosagem recomendada pelo fabricante."
        ),
      },
      substrate: {
        drainage: String(parsed.substrate?.drainage || "Boa drenagem"),
        idealMix: String(parsed.substrate?.idealMix || "Mistura aerada com matéria orgânica e perlita"),
      },
      environment: {
        temperature: String(parsed.environment?.temperature || "18°C a 27°C"),
        humidity: String(parsed.environment?.humidity || "Moderada a alta"),
        warning: String(parsed.environment?.warning || "Proteja contra correntes de ar frio intenso."),
      },
      maintenance: {
        pruning: String(parsed.maintenance?.pruning || "Remover folhas secas ou danificadas na base"),
        repotting: String(parsed.maintenance?.repotting || "Replantar a cada 1-2 anos se necessário"),
        generalTips: parsed.maintenance?.generalTips ? String(parsed.maintenance.generalTips) : undefined,
      },
      confidenceNote: String(
        parsed.confidenceNote ||
          "Orientações botânicas geradas a partir do nome científico. Monitore sempre as condições específicas do seu ambiente."
      ),
      source: "Assistente Botânico PlantAI",
      lastUpdated: new Date().toISOString(),
    };

    speciesCareGuideCache.set(cacheKey, guideData);

    return res.json({
      success: true,
      data: guideData,
      cached: false,
    });
  } catch (err: any) {
    console.error("Erro na rota /api/species-care-guide:", err);
    return res.status(500).json({
      error: err?.message || "Falha interna ao obter orientações de cuidados da espécie.",
    });
  }
});

// Official Plant Identification Endpoint (Pl@ntNet)
app.post("/api/identify-plant", async (req, res) => {
  const reqStart = Date.now();
  try {
    // -------------------------------------------------------------
    // ETAPA 1: Recebimento da requisição
    // -------------------------------------------------------------
    const hasBody = req.body !== undefined && req.body !== null;
    const isBodyObj = typeof req.body === "object";
    const organParam = (req.body?.organ || "auto").toString().toLowerCase().trim();
    console.log(
      `[IDENTIFY-PLANT Step 1/6] Requisição recebida | Método: ${req.method} | Content-Type: ${req.headers["content-type"] || "não especificado"} | Organ: ${organParam} | BodyPreParsed: ${hasBody && isBodyObj}`
    );

    // -------------------------------------------------------------
    // ETAPA 2: Validação do arquivo de imagem
    // -------------------------------------------------------------
    const { imageBase64, mimeType, organ } = req.body || {};

    if (!imageBase64 || typeof imageBase64 !== "string") {
      console.warn("[IDENTIFY-PLANT Step 2/6] Falha: campo imageBase64 ausente ou inválido no corpo da requisição.");
      return res.status(400).json({
        error: "A imagem em formato base64 é obrigatória para identificação botânica.",
        code: "MISSING_IMAGE_DATA",
      });
    }

    let cleanBase64 = imageBase64.trim();
    let detectedMimeType = typeof mimeType === "string" && mimeType.trim() ? mimeType.trim() : "image/jpeg";

    // Detect and strip Data URI prefix
    const dataUriMatch = cleanBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/s);
    if (dataUriMatch) {
      if (!mimeType) {
        detectedMimeType = dataUriMatch[1];
      }
      cleanBase64 = dataUriMatch[2].trim();
    }

    cleanBase64 = cleanBase64.replace(/\s/g, "");

    if (cleanBase64.length < 50) {
      console.warn("[IDENTIFY-PLANT Step 2/6] Falha: base64 muito curto ou corrompido.");
      return res.status(400).json({
        error: "O arquivo de imagem é inválido ou insuficiente para análise botânica.",
        code: "CORRUPTED_IMAGE_DATA",
      });
    }

    const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const normalizedMime = detectedMimeType.toLowerCase();
    const finalMime = allowedMimes.includes(normalizedMime)
      ? normalizedMime === "image/jpg" ? "image/jpeg" : normalizedMime
      : "image/jpeg";

    let imageBuffer: Buffer;
    try {
      imageBuffer = Buffer.from(cleanBase64, "base64");
    } catch (parseErr) {
      console.error("[IDENTIFY-PLANT Step 2/6] Erro ao decodificar base64:", parseErr);
      return res.status(400).json({
        error: "Falha na decodificação base64 da imagem enviada.",
        code: "DECODE_ERROR",
      });
    }

    // Size limit: 10MB
    const maxSizeBytes = 10 * 1024 * 1024;
    if (imageBuffer.length > maxSizeBytes) {
      console.warn(`[IDENTIFY-PLANT Step 2/6] Imagem excede 10MB (${(imageBuffer.length / (1024 * 1024)).toFixed(2)} MB).`);
      return res.status(400).json({
        error: "A imagem excede o tamanho máximo permitido de 10MB. Envie uma foto menor ou compactada.",
        code: "PAYLOAD_TOO_LARGE",
      });
    }

    console.log(
      `[IDENTIFY-PLANT Step 2/6] Imagem validada com sucesso | Formato: ${finalMime} | Tamanho binário: ${(imageBuffer.length / 1024).toFixed(1)} KB (Base64: ${(cleanBase64.length / 1024).toFixed(1)} KB)`
    );

    // -------------------------------------------------------------
    // ETAPA 3: Verificação da variável de ambiente PLANTNET_API_KEY
    // -------------------------------------------------------------
    const rawApiKey = process.env.PLANTNET_API_KEY;
    const apiKey = rawApiKey ? rawApiKey.trim() : "";

    if (!apiKey) {
      console.error(
        "[IDENTIFY-PLANT Step 3/6] FALHA CRÍTICA: Variável de ambiente PLANTNET_API_KEY não encontrada ou vazia no servidor Vercel."
      );
      return res.status(500).json({
        error: "A chave PLANTNET_API_KEY não está configurada no ambiente do servidor. Cadastre a variável PLANTNET_API_KEY no painel da Vercel (Settings > Environment Variables) e faça um novo deploy.",
        code: "MISSING_ENV_VAR",
      });
    }

    const maskedKey = apiKey.length > 6
      ? `${apiKey.slice(0, 4)}***${apiKey.slice(-2)} (${apiKey.length} caracteres)`
      : `*** (${apiKey.length} caracteres)`;
    console.log(`[IDENTIFY-PLANT Step 3/6] PLANTNET_API_KEY detectada | Chave mascarada: ${maskedKey}`);

    // -------------------------------------------------------------
    // ETAPA 4: Envio à API Oficial da Pl@ntNet
    // -------------------------------------------------------------
    const allowedOrgans = ["auto", "leaf", "flower", "fruit", "bark"];
    const organNormalized = typeof organ === "string" ? organ.trim().toLowerCase() : "auto";
    const selectedOrgan = allowedOrgans.includes(organNormalized) ? organNormalized : "auto";

    const formData = new FormData();
    const imageBlob = new Blob([imageBuffer], { type: finalMime });
    const extension = finalMime === "image/png" ? "png" : finalMime === "image/webp" ? "webp" : "jpg";
    formData.append("images", imageBlob, `planta.${extension}`);
    formData.append("organs", selectedOrgan);

    const plantnetUrl = new URL("https://my-api.plantnet.org/v2/identify/all");
    plantnetUrl.searchParams.set("api-key", apiKey);
    plantnetUrl.searchParams.set("lang", "pt");

    console.log(
      `[IDENTIFY-PLANT Step 4/6] Enviando multipart/form-data para ${plantnetUrl.origin}${plantnetUrl.pathname} (organ: ${selectedOrgan}, arquivo: planta.${extension})...`
    );

    const fetchStart = Date.now();
    const plantnetResponse = await fetch(plantnetUrl.toString(), {
      method: "POST",
      body: formData,
    });
    const fetchDuration = Date.now() - fetchStart;

    // -------------------------------------------------------------
    // ETAPA 5: Recebimento e diferenciação de respostas externas
    // -------------------------------------------------------------
    console.log(
      `[IDENTIFY-PLANT Step 5/6] Resposta Pl@ntNet recebida em ${fetchDuration}ms | Status HTTP: ${plantnetResponse.status} ${plantnetResponse.statusText}`
    );

    if (plantnetResponse.status === 404) {
      console.log("[IDENTIFY-PLANT Step 5/6] Pl@ntNet 404: Nenhuma correspondência taxonômica encontrada.");
      return res.json({
        success: true,
        candidates: [],
        message: "Nenhuma espécie botânica foi reconhecida com confiança para esta imagem. Tente enviar uma foto mais nítida, com boa iluminação e foco direto na folha ou flor.",
      });
    }

    if (plantnetResponse.status === 401 || plantnetResponse.status === 403) {
      console.error(
        `[IDENTIFY-PLANT Step 5/6] ERRO DE AUTORIZAÇÃO: Chave PLANTNET_API_KEY rejeitada pela Pl@ntNet (Status ${plantnetResponse.status}). A chave configurada é inválida ou expirou.`
      );
      return res.status(401).json({
        error: `A chave PLANTNET_API_KEY configurada na Vercel foi recusada pela Pl@ntNet (Status ${plantnetResponse.status}: não autorizada). Verifique sua chave no painel do my.plantnet.org.`,
        code: "INVALID_API_KEY",
      });
    }

    if (plantnetResponse.status === 429) {
      console.warn("[IDENTIFY-PLANT Step 5/6] Limite diário de requisições excedido na Pl@ntNet (Status 429).");
      return res.status(429).json({
        error: "O limite de requisições da Pl@ntNet foi atingido temporariamente. Aguarde alguns instantes antes de tentar novamente.",
        code: "RATE_LIMIT_EXCEEDED",
      });
    }

    if (plantnetResponse.status === 400) {
      const errorBody: any = await plantnetResponse.json().catch(() => ({}));
      console.warn("[IDENTIFY-PLANT Step 5/6] Pl@ntNet rejeitou a imagem (Status 400):", errorBody?.message || errorBody);
      return res.status(400).json({
        error: errorBody?.message || "A imagem enviada não foi aceita pela API da Pl@ntNet. Use fotos nos formatos JPEG, PNG ou WEBP.",
        code: "BAD_IMAGE_FORMAT",
      });
    }

    if (!plantnetResponse.ok) {
      const rawText = await plantnetResponse.text().catch(() => "");
      console.error(`[IDENTIFY-PLANT Step 5/6] Falha de comunicação externa (Status ${plantnetResponse.status}):`, rawText.slice(0, 200));
      return res.status(502).json({
        error: `O serviço externo de identificação botânica (Pl@ntNet) retornou status ${plantnetResponse.status}. Tente novamente mais tarde.`,
        code: "EXTERNAL_SERVICE_ERROR",
        status: plantnetResponse.status,
      });
    }

    // -------------------------------------------------------------
    // ETAPA 6: Conversão e retorno do resultado ao frontend
    // -------------------------------------------------------------
    const json: any = await plantnetResponse.json();
    const rawResults = Array.isArray(json?.results) ? json.results : [];
    const bestMatch = typeof json?.bestMatch === "string" ? json.bestMatch : "";
    const remainingRequests = typeof json?.remainingIdentificationRequests === "number" ? json.remainingIdentificationRequests : undefined;

    const candidates = rawResults.slice(0, 8).map((item: any) => {
      const rawScore = typeof item?.score === "number" ? item.score : 0;
      const scorePercentage = Math.round(rawScore * 1000) / 10;
      const sp = item?.species || {};
      const scientificName = String(sp?.scientificName || sp?.scientificNameWithoutAuthor || "Espécie desconhecida").trim();
      const scientificNameWithoutAuthor = String(sp?.scientificNameWithoutAuthor || scientificName).trim();
      const commonNames = Array.isArray(sp?.commonNames)
        ? sp.commonNames.map((n: any) => String(n).trim()).filter((n: string) => n.length > 0)
        : [];
      const family = sp?.family?.scientificNameWithoutAuthor ? String(sp.family.scientificNameWithoutAuthor).trim() : undefined;
      const genus = sp?.genus?.scientificNameWithoutAuthor ? String(sp.genus.scientificNameWithoutAuthor).trim() : undefined;

      let sampleImageUrl: string | undefined;
      if (Array.isArray(item?.images) && item.images.length > 0) {
        sampleImageUrl = item.images[0]?.url?.s || item.images[0]?.url?.m || item.images[0]?.url?.o;
      }

      return {
        score: rawScore,
        scorePercentage,
        scientificName,
        scientificNameWithoutAuthor,
        commonNames,
        family,
        genus,
        sampleImageUrl,
      };
    });

    const totalDuration = Date.now() - reqStart;
    console.log(
      `[IDENTIFY-PLANT Step 6/6] Sucesso! ${candidates.length} candidatos identificados em ${totalDuration}ms | Melhor correspondência: "${bestMatch || "N/A"}" | Quota restante: ${remainingRequests ?? "N/A"}`
    );

    return res.json({
      success: true,
      bestMatch,
      candidates,
      remainingRequests,
    });
  } catch (err: any) {
    const totalDuration = Date.now() - reqStart;
    console.error(`[IDENTIFY-PLANT EXCEPTION] Erro após ${totalDuration}ms:`, err?.message || err);
    return res.status(500).json({
      error: err?.message || "Erro interno no servidor ao processar identificação da planta.",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
});

// Gemini Multimodal Plant Identification Endpoint (Alternative/Fallback)
app.post("/api/ai/identify-plant", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "Chave GEMINI_API_KEY não configurada no servidor.",
      });
    }

    const { imageBase64, mimeType, userNotes } = req.body;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({
        error: "A imagem em formato base64 é obrigatória.",
      });
    }

    let cleanBase64 = imageBase64.trim();
    let detectedMimeType = typeof mimeType === "string" && mimeType.trim() ? mimeType.trim() : "image/jpeg";

    const dataUriMatch = cleanBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/s);
    if (dataUriMatch) {
      if (!mimeType) {
        detectedMimeType = dataUriMatch[1];
      }
      cleanBase64 = dataUriMatch[2].trim();
    }

    cleanBase64 = cleanBase64.replace(/\s/g, "");

    if (cleanBase64.length < 50) {
      return res.status(400).json({
        error: "O conteúdo base64 fornecido é inválido ou insuficiente para uma imagem.",
      });
    }

    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (!allowedMimes.includes(detectedMimeType.toLowerCase())) {
      detectedMimeType = "image/jpeg";
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const prompt = `Você é um botânico especialista do aplicativo "PlantAI". Analise com rigor a fotografia e identifique a espécie vegetal com honestidade científica e cautela.
${userNotes ? `Informações adicionais do usuário: "${String(userNotes).slice(0, 300)}"` : ""}
Responda ESTRITAMENTE em formato JSON.`;

    const imagePart = {
      inlineData: {
        mimeType: detectedMimeType,
        data: cleanBase64,
      },
    };

    const textPart = { text: prompt };

    const candidateModels = ["gemini-3.6-flash", "gemini-3.8-flash"];
    let geminiResponse: any = null;
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        geminiResponse = await ai.models.generateContent({
          model,
          contents: { parts: [imagePart, textPart] },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                isPlant: { type: Type.BOOLEAN },
                commonName: { type: Type.STRING },
                scientificName: { type: Type.STRING },
                confidence: { type: Type.STRING, enum: ["alto", "medio", "baixo"] },
                isReliable: { type: Type.BOOLEAN },
                alternativeSpecies: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                generalBotanicalCare: {
                  type: Type.OBJECT,
                  properties: {
                    lighting: { type: Type.STRING },
                    watering: { type: Type.STRING },
                    pruning: { type: Type.STRING },
                    fertilization: { type: Type.STRING },
                  },
                  required: ["lighting", "watering", "pruning", "fertilization"],
                },
                environmentalConsiderations: { type: Type.STRING },
                identificationNotes: { type: Type.STRING },
              },
              required: [
                "isPlant",
                "confidence",
                "isReliable",
                "alternativeSpecies",
                "generalBotanicalCare",
                "environmentalConsiderations",
                "identificationNotes",
              ],
            },
          },
        });
        if (geminiResponse?.text) break;
      } catch (err: any) {
        lastError = err;
        console.warn(`Tentativa com modelo ${model} falhou:`, err?.message || err);
      }
    }

    if (!geminiResponse?.text) {
      throw new Error(lastError?.message || "O serviço Gemini não retornou resposta válida.");
    }

    const rawParsed = JSON.parse(geminiResponse.text);
    return res.json({ success: true, data: rawParsed });
  } catch (err: any) {
    console.error("Erro na rota /api/ai/identify-plant:", err);
    return res.status(500).json({
      error: err?.message || "Falha interna ao identificar a planta pela imagem.",
    });
  }
});

// =========================================================================
// METEOROLOGIA & LOCALIZAÇÃO (OPEN-METEO API & NOMINATIM)
// =========================================================================

const getWmoCondition = (code: number): string => {
  switch (code) {
    case 0: return "Céu limpo";
    case 1: return "Predominantemente limpo";
    case 2: return "Parcialmente nublado";
    case 3: return "Encoberto";
    case 45: case 48: return "Nevoeiro";
    case 51: return "Garoa leve";
    case 53: return "Garoa moderada";
    case 55: return "Garoa intensa";
    case 61: return "Chuva fraca";
    case 63: return "Chuva moderada";
    case 65: return "Chuva forte";
    case 71: return "Neve fraca";
    case 73: return "Neve moderada";
    case 75: return "Neve forte";
    case 80: return "Pancadas de chuva leves";
    case 81: return "Pancadas de chuva moderadas";
    case 82: return "Pancadas de chuva violentas";
    case 95: return "Tempestade com trovoadas";
    default: return "Tempo estável";
  }
};

const getBotanicalWeatherInsight = (temp: number, weatherCode: number, humidity?: number): string => {
  if (temp >= 32) {
    return "Atenção ao calor intenso: aumente a verificação de umidade e proteja plantas sensíveis do sol direto forte.";
  }
  if (temp <= 12) {
    return "Atenção ao frio: reduza regas e proteja plantas tropicais de correntes de ar frio.";
  }
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95].includes(weatherCode)) {
    return "Chuva na região: ajuste as regas de vasos expostos e aproveite a umidade natural do ar.";
  }
  if (humidity && humidity < 40) {
    return "Ar seco: considere borrifar levemente folhas de samambaias e aráceas para manter a turgidez.";
  }
  return "Clima favorável para o desenvolvimento saudável das plantas.";
};

// 1. Obter Clima Atual (Open-Meteo)
app.get("/api/weather/current", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lon = parseFloat(req.query.lon as string);

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({
        success: false,
        error: "Coordenadas geográficas inválidas fornecidas.",
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,is_day&timezone=auto`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Open-Meteo retornou status ${response.status}`);
    }

    const data = await response.json();
    const current = data?.current;

    if (!current || typeof current.temperature_2m !== "number") {
      throw new Error("Formato de dados meteorológicos inesperado retornado pela API.");
    }

    const tempCelsius = Math.round(current.temperature_2m * 10) / 10;
    const humidity = typeof current.relative_humidity_2m === "number" ? Math.round(current.relative_humidity_2m) : undefined;
    const weatherCode = Number(current.weather_code) || 0;
    const conditionText = getWmoCondition(weatherCode);
    const isDay = current.is_day === 1;

    let observationTime = "Agora";
    if (current.time) {
      try {
        const parts = current.time.split("T");
        if (parts.length === 2) {
          observationTime = parts[1].slice(0, 5);
        }
      } catch {
        observationTime = "Agora";
      }
    }

    const gardenInsight = getBotanicalWeatherInsight(tempCelsius, weatherCode, humidity);

    return res.json({
      success: true,
      data: {
        temperature: tempCelsius,
        humidity,
        weatherCode,
        conditionText,
        isDay,
        observationTime,
        gardenInsight,
        sourceAttribution: "Open-Meteo.com (Open Database License)",
        timezone: data.timezone || "auto",
      },
    });
  } catch (err: any) {
    console.error("Erro na rota /api/weather/current:", err);
    return res.status(503).json({
      success: false,
      error: "Não foi possível consultar os dados meteorológicos no momento. Verifique sua conexão e tente novamente.",
    });
  }
});

// 2. Pesquisa Manual de Cidades (Open-Meteo Geocoding)
app.get("/api/weather/search", async (req, res) => {
  try {
    const q = ((req.query.q as string) || "").trim();

    if (q.length < 2) {
      return res.json({ success: true, results: [] });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=pt&format=json`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Open-Meteo Geocoding retornou status ${response.status}`);
    }

    const data = await response.json();
    const rawResults = Array.isArray(data?.results) ? data.results : [];

    const results = rawResults.map((item: any) => {
      const parts = [item.name];
      if (item.admin1 && item.admin1 !== item.name) parts.push(item.admin1);
      if (item.country) parts.push(item.country);

      return {
        id: item.id,
        name: item.name,
        admin1: item.admin1 || "",
        country: item.country || "",
        latitude: item.latitude,
        longitude: item.longitude,
        formattedLabel: parts.join(", "),
      };
    });

    return res.json({ success: true, results });
  } catch (err: any) {
    console.error("Erro na rota /api/weather/search:", err);
    return res.status(500).json({
      success: false,
      results: [],
      error: "Erro ao buscar cidades na API de geocodificação.",
    });
  }
});

// 3. Geocodificação Reversa para Coordenadas do Dispositivo (Nominatim)
app.get("/api/weather/reverse", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lon = parseFloat(req.query.lon as string);

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ success: false, error: "Coordenadas inválidas." });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=pt`;
    const response = await fetch(url, {
      headers: { "User-Agent": "PlantAI-JardimApp/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const address = data?.address || {};
      const cityName =
        address.city ||
        address.town ||
        address.municipality ||
        address.village ||
        address.county ||
        address.state ||
        "Minha Localização";

      const stateName = address.state && address.state !== cityName ? address.state : "";
      const country = address.country || "";

      const parts = [cityName];
      if (stateName) parts.push(stateName);
      if (country) parts.push(country);

      return res.json({
        success: true,
        name: parts.join(", "),
        city: cityName,
      });
    }

    return res.json({
      success: true,
      name: `Local (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`,
      city: "Minha Localização",
    });
  } catch (err: any) {
    console.warn("Aviso: falha na geocodificação reversa, utilizando fallback de coordenadas:", err.message);
    const lat = parseFloat(req.query.lat as string);
    const lon = parseFloat(req.query.lon as string);
    return res.json({
      success: true,
      name: `Local (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`,
      city: "Minha Localização",
    });
  }
});

// Structured JSON 404 handler for backend API routes
// Prevents any API request from ever returning an HTML 404 page that breaks JSON parsers
app.use((req, res, next) => {
  const pathOnly = (req.url || "").split("?")[0];
  if (pathOnly.startsWith("/api") || API_PREFIXES.some((p) => pathOnly === p || pathOnly.startsWith(p + "/"))) {
    return res.status(404).json({
      error: `Endpoint da API não encontrado: ${req.method} ${pathOnly}`,
      status: 404,
    });
  }
  next();
});

// Global JSON Error Handler
// Prevents Express from ever falling back to its default HTML error page on internal server errors
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const statusCode =
    typeof err?.status === "number"
      ? err.status
      : typeof err?.statusCode === "number"
      ? err.statusCode
      : 500;

  console.error(`[EXPRESS GLOBAL ERROR] ${req.method} ${req.url} - Status ${statusCode}:`, err?.message || err);

  if (!res.headersSent) {
    res.status(statusCode).json({
      error: err?.message || "Erro interno no servidor ao processar a requisição.",
      code: err?.code || "INTERNAL_ERROR",
      status: statusCode,
      timestamp: new Date().toISOString(),
    });
  }
});

export default function handler(
  req: IncomingMessage & { body?: any; _body?: boolean; query?: any },
  res: ServerResponse
) {
  if (req.body !== undefined && req.body !== null) {
    req._body = true;
  }
  return app(req as any, res as any);
}
