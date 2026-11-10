import type { IncomingMessage, ServerResponse } from "http";
import express from "express";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

export const app = express();
export const maxDuration = 60;

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
  "/diagnose-plant",
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

// =========================================================================
// DIAGNÓSTICO FITOSSANITÁRIO (PLANT HEALTH DIAGNOSIS VIA GEMINI MULTIMODAL)
// =========================================================================
app.post(["/api/diagnose-plant", "/diagnose-plant"], async (req, res) => {
  const reqStart = Date.now();
  try {
    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) {
      return res.status(500).json({
        error: "A chave GEMINI_API_KEY não está configurada no servidor. Configure a chave no painel da Vercel ou Secrets.",
        code: "MISSING_API_KEY",
      });
    }

    const { imagesBase64, imagesMetadata, plantContext, userSymptoms } = req.body || {};

    if (!Array.isArray(imagesBase64) || imagesBase64.length === 0) {
      return res.status(400).json({
        error: "Pelo menos uma fotografia (Foto 1) é obrigatória para o diagnóstico de saúde.",
        code: "MISSING_IMAGE_DATA",
      });
    }

    if (imagesBase64.length > 3) {
      return res.status(400).json({
        error: "O diagnóstico suporta no máximo 3 fotografias por consulta.",
        code: "TOO_MANY_IMAGES",
      });
    }

    // Process and validate 1 to 3 images
    const imageParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
    let totalBytes = 0;

    for (let i = 0; i < imagesBase64.length; i++) {
      const rawImg = imagesBase64[i];
      if (!rawImg || typeof rawImg !== "string") {
        return res.status(400).json({
          error: `A fotografia ${i + 1} enviada é inválida.`,
          code: "INVALID_IMAGE_ITEM",
        });
      }

      let cleanBase64 = rawImg.trim();
      let detectedMime = "image/jpeg";

      const dataUriMatch = cleanBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/s);
      if (dataUriMatch) {
        detectedMime = dataUriMatch[1];
        cleanBase64 = dataUriMatch[2].trim();
      }

      cleanBase64 = cleanBase64.replace(/\s/g, "");

      if (cleanBase64.length < 50) {
        return res.status(400).json({
          error: `A fotografia ${i + 1} contém dados insuficientes ou corrompidos.`,
          code: "CORRUPTED_IMAGE_DATA",
        });
      }

      const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
      const normalizedMime = detectedMime.toLowerCase();
      const finalMime = allowedMimes.includes(normalizedMime)
        ? normalizedMime === "image/jpg" ? "image/jpeg" : normalizedMime
        : "image/jpeg";

      const buf = Buffer.from(cleanBase64, "base64");
      totalBytes += buf.length;

      imageParts.push({
        inlineData: {
          mimeType: finalMime,
          data: cleanBase64,
        },
      });
    }

    // Maximum combined decoded binary size: 4MB (well within Vercel's 4.5MB limit)
    if (totalBytes > 4 * 1024 * 1024) {
      return res.status(400).json({
        error: "O tamanho total combinado das imagens excede o limite de 4MB. Por favor, envie fotos compactadas.",
        code: "PAYLOAD_TOO_LARGE",
      });
    }

    // Parse contextual information
    const species = plantContext?.species ? String(plantContext.species).trim() : "";
    const plantName = plantContext?.name ? String(plantContext.name).trim() : "";
    const envName = plantContext?.environmentName ? String(plantContext.environmentName).trim() : "";
    const wateringFreq = plantContext?.wateringFrequency ? String(plantContext.wateringFrequency).trim() : "";
    const sunlight = plantContext?.sunlightType ? String(plantContext.sunlightType).trim() : "";
    const lastWatered = plantContext?.lastWatered ? String(plantContext.lastWatered).trim() : "";
    const substrate = plantContext?.substrate ? String(plantContext.substrate).trim() : "";

    const symptomsList = Array.isArray(userSymptoms?.selectedSymptoms) && userSymptoms.selectedSymptoms.length > 0
      ? userSymptoms.selectedSymptoms.join(", ")
      : "Nenhum sintoma pré-selecionado pelo usuário (análise puramente visual)";
    const soilState = userSymptoms?.soilStateNow || "Não informado";
    const drainage = userSymptoms?.potHasDrainageHoles || "Não informado";
    const envNotes = userSymptoms?.environmentNotes ? String(userSymptoms.environmentNotes).trim() : "";
    const details = userSymptoms?.additionalDetails ? String(userSymptoms.additionalDetails).trim() : "";

    const prompt = `Você é o Médico Botânico e Fitopatologista Sênior do aplicativo "PlantAI".
Sua missão é realizar uma investigação fitossanitária criteriosa, humana e cientificamente honesta sobre a saúde da planta com base nas fotografias e no contexto fornecido.

=== DADOS DE ENTRADA ===
- Espécie conhecida: ${species ? `"${species}"` : "Espécie não cadastrada/desconhecida"}
- Nome afetivo: ${plantName ? `"${plantName}"` : "Não informado"}
- Ambiente habitual: ${envName || "Não informado"}
- Frequência habitual de rega: ${wateringFreq || "Não informada"}
- Exposição solar habitual: ${sunlight || "Não informada"}
- Última rega registrada: ${lastWatered || "Não informada"}
- Substrato utilizado: ${substrate || "Não informado"}
- Sintomas relatados pelo tutor: ${symptomsList}
- Estado atual do solo relatado: ${soilState}
- Presença de orifícios de drenagem no vaso: ${drainage}
- Observações de ambiente: ${envNotes || "Nenhuma"}
- Quantidade de imagens analisadas: ${imageParts.length}
${imageParts.map((_, idx) => {
  const meta = Array.isArray(imagesMetadata) && imagesMetadata[idx];
  return `  * Imagem ${idx + 1}: ${meta?.label ? meta.label : `Foto ${idx + 1}`}`;
}).join("\n")}

=== DIRETRIZES FITOSSANITÁRIAS E DE PRECAUÇÃO (RIGOR BOTÂNICO) ===
1. AVALIAÇÃO DA QUALIDADE DAS FOTOGRAFIAS:
   - Se as fotografias forem escuras, borradas, sem foco ou não mostrarem as partes afetadas, você DEVE classificar:
     * overallHealthStatus = "INDETERMINADO"
     * confidenceLevel = "INCONCLUSIVA"
     * confidenceReasoning: explique claramente o motivo visual (ex: foto desfocada ou iluminação insuficiente).
     * missingInfoNeeded: liste exatamente quais ângulos e detalhes o usuário deve fotografar para permitir um diagnóstico.
   - NUNCA invente doenças se a imagem não fornecer evidências suficientes.

2. PRIORIDADE A FATORES CULTURAIS E ABIÓTICOS:
   - Mais de 80% dos problemas em plantas domésticas decorrem de erros de manejo (excesso de rega, deficiência de drenagem com asfixia radicular, falta ou excesso de luz, ar seco, choque térmico).
   - Avalie sempre essas causas primeiro, correlacionando a espécie com o relato de rega e drenagem.
   - Só formule hipóteses de pragas ou patógenos fúngicos/bacterianos se houver sintomas visuais inequívocos (ex: esporulação, halos concêntricos, teias de ácaro, colônias de cochonilha). Nunca afirme como certeza absoluta caso haja ambiguidade.

3. RECOMENDAÇÕES SOBRE ADUBAÇÃO (FERTILIZANTES):
   - Nunca use contraindicações universais automáticas.
   - Se recomendar cautela ou suspensão da fertilização, justifique botânica e especificamente (ex: raízes sob estresse hídrico ou com perda de radículas não conseguem absorver sais minerais; ou planta em dormência sazonal; ou necessidade de lixiviação por excesso de sais).

4. RECOMENDAÇÕES SOBRE IRRIGAÇÃO:
   - Não dê ordens cegas de calendário (ex: "fique 15 dias sem regar").
   - Prescreva checagem tátil do solo (ex: "Aguarde os primeiros 3 a 4 cm do substrato secarem completamente antes de aplicar nova rega").

5. ESTRUTURAÇÃO DA RESPOSTA:
   - "visualEvidence": liste apenas o que você REALMENTE enxerga nas fotos (ex: "Clorose intervenal nas folhas basais", "Bordas necróticas secas").
   - "userReportedContext": resuma o que o tutor informou que ajudou a nortear a análise.
   - "hypotheses": causas prováveis ordenadas da mais provável para a menos provável.
   - "missingInfoNeeded": orientações práticas do que o tutor precisa checar presencialmente (ex: verificar furos no fundo do vaso, olhar sob as folhas).
   - "actionPlan": immediateSteps (o que fazer agora/hoje) e ongoingAdjustments (mudanças na rotina).
   - "whatToAvoid": o que NÃO fazer para não piorar a planta.
   - "consultSpecialistAlert": quando procurar agrônomo/floricultura especializada caso o problema fuja do controle.
   - "suggestedStatusChange": sugira "NEEDS_CARE", "RECOVERING", "HEALTHY" ou null se indiferente.
   - "disclaimer": aviso ético de que é uma análise orientativa por IA e não substitui inspeção presencial.

Responda ESTRITAMENTE em formato JSON de acordo com o esquema definido.`;

    const contents = {
      parts: [...imageParts, { text: prompt }],
    };

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: 22000,
        headers: { "User-Agent": "aistudio-build" },
      },
    });

    const candidateModels = ["gemini-3.8-flash", "gemini-3.6-flash"];
    let geminiResponse: any = null;
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        console.log(`[DIAGNOSE-PLANT] Tentando análise fitossanitária com ${model} (${imageParts.length} fotos)...`);
        const perModelTimeout = 11000;
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT_EXCEEDED")), perModelTimeout)
        );

        geminiResponse = await Promise.race([
          ai.models.generateContent({
            model,
            contents,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  conditionSummary: { type: Type.STRING },
                  overallHealthStatus: {
                    type: Type.STRING,
                    enum: ["BOM", "ALERTA", "CRITICO", "INDETERMINADO"],
                  },
                  confidenceLevel: {
                    type: Type.STRING,
                    enum: ["ALTA", "MODERADA", "BAIXA", "INCONCLUSIVA"],
                  },
                  confidenceReasoning: { type: Type.STRING },
                  visualEvidence: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  userReportedContext: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  hypotheses: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        causeName: { type: Type.STRING },
                        category: {
                          type: Type.STRING,
                          enum: [
                            "IRRIGACAO",
                            "ILUMINACAO",
                            "NUTRICAO",
                            "PRAGA",
                            "PATOGENO_FUNGO_BACTERIA",
                            "SUBSTRATO_DRENAGEM",
                            "CLIMA_TEMPERATURA",
                            "INDETERMINADA",
                          ],
                        },
                        probability: {
                          type: Type.STRING,
                          enum: ["PROVAVEL", "POSSIVEL", "MENOS_PROVAVEL"],
                        },
                        visualEvidence: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                        physiologicalMechanism: { type: Type.STRING },
                        specificAction: { type: Type.STRING },
                      },
                      required: [
                        "causeName",
                        "category",
                        "probability",
                        "visualEvidence",
                        "physiologicalMechanism",
                        "specificAction",
                      ],
                    },
                  },
                  missingInfoNeeded: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  actionPlan: {
                    type: Type.OBJECT,
                    properties: {
                      immediateSteps: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      ongoingAdjustments: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                    },
                    required: ["immediateSteps", "ongoingAdjustments"],
                  },
                  whatToAvoid: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  consultSpecialistAlert: { type: Type.STRING },
                  suggestedStatusChange: {
                    type: Type.STRING,
                    enum: ["HEALTHY", "NEEDS_CARE", "DORMANT", "RECOVERING", "NONE"],
                  },
                  disclaimer: { type: Type.STRING },
                },
                required: [
                  "conditionSummary",
                  "overallHealthStatus",
                  "confidenceLevel",
                  "confidenceReasoning",
                  "visualEvidence",
                  "userReportedContext",
                  "hypotheses",
                  "missingInfoNeeded",
                  "actionPlan",
                  "whatToAvoid",
                  "disclaimer",
                ],
              },
            },
          }),
          timeoutPromise,
        ]);

        if (geminiResponse?.text) {
          console.log(`[DIAGNOSE-PLANT] Sucesso com ${model} em ${Date.now() - reqStart}ms.`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[DIAGNOSE-PLANT] Falha na tentativa com ${model}:`, err?.message || err);
        const errMsg = String(err?.message || "").toLowerCase();
        const isTransient =
          errMsg.includes("503") ||
          errMsg.includes("504") ||
          errMsg.includes("deadline") ||
          errMsg.includes("unavailable") ||
          errMsg.includes("429") ||
          errMsg.includes("timeout") ||
          errMsg.includes("network") ||
          errMsg.includes("fetch failed");
        if (!isTransient && !errMsg.includes("timeout_exceeded")) {
          break;
        }
      }
    }

    if (!geminiResponse?.text) {
      console.warn("[DIAGNOSE-PLANT] Ativando síntese fitossanitária botânica resiliente por indisponibilidade transitória da IA:", lastError?.message);

      const isOverwatered =
        soilState === "ENCHARCADO" ||
        drainage === "NAO" ||
        symptomsList.includes("amareladas") ||
        symptomsList.includes("amolecidos");

      const isUnderwatered =
        soilState === "MUITO_SECO" ||
        symptomsList.includes("murchas") ||
        symptomsList.includes("queimadas");

      const hasPests = symptomsList.includes("Insetos") || symptomsList.includes("teias");

      const hasLeafSpots = symptomsList.includes("Manchas") || symptomsList.includes("necrose");

      const fallbackHypotheses: any[] = [];

      if (isOverwatered) {
        fallbackHypotheses.push({
          causeName: "Possível asfixia radicular e saturação hídrica do substrato",
          category: "IRRIGACAO",
          probability: "POSSIVEL",
          visualEvidence: ["Nenhuma observação visual confirmada pela IA; hipótese formulada com base no relato de solo úmido/encharcado e folhas amareladas."],
          physiologicalMechanism: "O excesso de água no vaso expulsa o oxigênio dos poros do solo, asfixiando as raízes e impedindo a respiração celular.",
          specificAction: "Suspender as regas imediatamente até que os primeiros 4 cm do solo sequem; assegurar que o vaso possua orifícios de drenagem livres.",
        });
      }

      if (isUnderwatered) {
        fallbackHypotheses.push({
          causeName: "Possível déficit hídrico ou baixa umidade relativa do ar",
          category: "IRRIGACAO",
          probability: "POSSIVEL",
          visualEvidence: ["Nenhuma observação visual confirmada pela IA; hipótese formulada com base no relato de solo seco ou folhas caídas."],
          physiologicalMechanism: "A perda de água por transpiração foliar excede a absorção radicular, provocando perda de turgidez nas células.",
          specificAction: "Realizar rega lenta e abundante até umedecer todo o torrão, descartando o excesso de água do prato após 15 minutos.",
        });
      }

      if (hasPests) {
        fallbackHypotheses.push({
          causeName: "Possível infestação por pragas domésticas (cochonilhas, ácaros ou tripes)",
          category: "PRAGA",
          probability: "POSSIVEL",
          visualEvidence: ["Nenhuma observação visual confirmada pela IA; hipótese formulada com base no relato de insetos ou teias."],
          physiologicalMechanism: "Insetos sugadores extraem a seiva elaborada, debilitando o tecido vegetal e favorecendo infecções oportunistas.",
          specificAction: "Isolar a planta de outras espécies e efetuar limpeza mecânica com algodão embebido em calda de sabão neutro.",
        });
      }

      if (hasLeafSpots) {
        fallbackHypotheses.push({
          causeName: "Possível lesão foliar ou estresse ambiental",
          category: "PATOGENO_FUNGO_BACTERIA",
          probability: "POSSIVEL",
          visualEvidence: ["Nenhuma observação visual confirmada pela IA; hipótese formulada com base no relato de manchas ou necroses foliares."],
          physiologicalMechanism: "Patógenos oportunistas ou estresse térmico/solar provocam danos celulares em tecidos foliares fragilizados.",
          specificAction: "Remover folhas com dano severo usando tesoura esterilizada e evitar molhar a folhagem durante as regas.",
        });
      }

      if (fallbackHypotheses.length === 0) {
        fallbackHypotheses.push({
          causeName: "Avaliação inconclusiva por indisponibilidade temporária da IA",
          category: "INDETERMINADA",
          probability: "MENOS_PROVAVEL",
          visualEvidence: ["A análise visual por visão computacional não pôde ser executada devido à indisponibilidade temporária do serviço de IA."],
          physiologicalMechanism: "Sem análise visual das fotos e sem sintomas específicos relatados, não é prudente inferir causas patológicas.",
          specificAction: "Inspecione presencialmente o substrato e a parte inferior das folhas, e repita o diagnóstico fotográfico em instantes.",
        });
      }

      const hasUserInputs =
        (Array.isArray(userSymptoms?.selectedSymptoms) && userSymptoms.selectedSymptoms.length > 0) ||
        soilState !== "Não informado" ||
        drainage !== "Não informado";

      const fallbackResult = {
        id: `diag-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        createdAt: new Date().toISOString(),
        plantSpecies: species || undefined,
        plantName: plantName || undefined,
        conditionSummary: hasUserInputs
          ? `Diagnóstico visual temporariamente indisponível. Orientações preliminares baseadas exclusivamente no histórico e sintomas relatados para ${species || "sua planta"}.`
          : "Diagnóstico por imagem temporariamente indisponível nos servidores de IA. Não foi possível analisar visualmente as fotografias.",
        overallHealthStatus: "INDETERMINADO" as const,
        confidenceLevel: "INCONCLUSIVA" as const,
        confidenceReasoning: "A análise multimodal automática enfrentou indisponibilidade temporária nos servidores da IA. Este laudo não representa uma avaliação visual das fotografias, consistindo em orientações preliminares baseadas unicamente no histórico informado pelo tutor. Recomenda-se realizar uma nova tentativa com as fotografias assim que o serviço estiver restabelecido.",
        visualEvidence: [
          "A análise visual por visão computacional não pôde ser executada devido à indisponibilidade temporária do serviço de IA.",
          "Nenhuma evidência visual foi inspecionada ou confirmada automaticamente nas imagens enviadas.",
        ],
        userReportedContext: [
          `Espécie: ${species || "Não informada"}`,
          `Sintomas relatados: ${symptomsList}`,
          `Solo atual informado: ${soilState}`,
          `Vaso com drenagem: ${drainage}`,
        ],
        hypotheses: fallbackHypotheses,
        missingInfoNeeded: [
          "Repetir o diagnóstico fotográfico quando os servidores de IA estiverem disponíveis.",
          "Verificar se o fundo do vaso possui orifícios de drenagem desobstruídos.",
          "Checar com os dedos ou palito a umidade no meio do torrão de raízes.",
          "Examinar o verso das folhas contra a luz procurando pequenos insetos ou pontuações.",
        ],
        actionPlan: {
          immediateSteps: [
            fallbackHypotheses[0].specificAction,
            "Tentar novamente o diagnóstico por imagem no PlantAI em alguns instantes para validação visual completa.",
          ],
          ongoingAdjustments: [
            "Só regar quando os primeiros 3 a 4 cm do solo estiverem comprovadamente secos ao toque.",
            "Garantir luminosidade adequada para a espécie sem exposição direta ao sol forte.",
          ],
        },
        whatToAvoid: [
          "Não aplicar fertilizantes concentrados enquanto o diagnóstico visual não for confirmado.",
          "Não deixar água acumulada no pratinho sob o vaso.",
        ],
        consultSpecialistAlert: "Se os sintomas piorarem rapidamente ou houver amolecimento generalizado das hastes, consulte um profissional agrônomo ou floricultura especializada.",
        suggestedStatusChange: null,
        disclaimer: "Atenção: A análise visual por IA não pôde ser processada nesta consulta por indisponibilidade transitória dos servidores. As hipóteses e recomendações acima baseiam-se unicamente nas informações de texto e sintomas fornecidos pelo tutor, sem validação fotográfica.",
      };

      return res.json({
        success: true,
        data: fallbackResult,
      });
    }

    const rawParsed = JSON.parse(geminiResponse.text);

    // Normalize suggestedStatusChange from "NONE" to null
    let suggestedStatus = rawParsed.suggestedStatusChange;
    if (suggestedStatus === "NONE" || !suggestedStatus) {
      suggestedStatus = null;
    }

    const diagnosisResult = {
      id: `diag-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
      plantSpecies: species || undefined,
      plantName: plantName || undefined,
      conditionSummary: rawParsed.conditionSummary || "",
      overallHealthStatus: rawParsed.overallHealthStatus || "INDETERMINADO",
      confidenceLevel: rawParsed.confidenceLevel || "INCONCLUSIVA",
      confidenceReasoning: rawParsed.confidenceReasoning || "",
      visualEvidence: Array.isArray(rawParsed.visualEvidence) ? rawParsed.visualEvidence : [],
      userReportedContext: Array.isArray(rawParsed.userReportedContext) ? rawParsed.userReportedContext : [],
      hypotheses: Array.isArray(rawParsed.hypotheses) ? rawParsed.hypotheses : [],
      missingInfoNeeded: Array.isArray(rawParsed.missingInfoNeeded) ? rawParsed.missingInfoNeeded : [],
      actionPlan: {
        immediateSteps: Array.isArray(rawParsed.actionPlan?.immediateSteps) ? rawParsed.actionPlan.immediateSteps : [],
        ongoingAdjustments: Array.isArray(rawParsed.actionPlan?.ongoingAdjustments) ? rawParsed.actionPlan.ongoingAdjustments : [],
      },
      whatToAvoid: Array.isArray(rawParsed.whatToAvoid) ? rawParsed.whatToAvoid : [],
      consultSpecialistAlert: rawParsed.consultSpecialistAlert || undefined,
      suggestedStatusChange: suggestedStatus,
      disclaimer: rawParsed.disclaimer || "Este laudo é uma análise preliminar baseada em inteligência artificial e não substitui o parecer presencial de um agrônomo ou botânico.",
    };

    return res.json({
      success: true,
      data: diagnosisResult,
    });
  } catch (err: any) {
    console.error("[DIAGNOSE-PLANT EXCEPTION]", err);
    return res.status(500).json({
      error: err?.message || "Erro interno ao processar o diagnóstico fitossanitário.",
      code: "INTERNAL_ERROR",
    });
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
1. REGA E INTERVALO NUMÉRICO:
   - NÃO USE 7 DIAS COMO VALOR PADRÃO UNIVERSAL. Avalie as necessidades fisiológicas reais da espécie.
   - Cactos e suculentas (Cactaceae, Crassulaceae, Sansevieria/Dracaena trifasciata, Zamioculcas zamiifolia): intervalo de 14 a 30 dias (wateringDaysRecommended entre 14 e 25).
   - Samambaias e plantas de solo úmido (Nephrolepis, Adiantum, Calathea, Maranta): intervalo de 2 a 4 dias.
   - Aráceas e folhagens tropicais (Monstera, Philodendron, Epipremnum, Ficus): intervalo de 5 a 9 dias.
   - Forneça:
     * wateringDaysRecommended: inteiro com o intervalo recomendado central em dias.
     * wateringDaysMin: inteiro com o intervalo mínimo em dias sob calor e seca.
     * wateringDaysMax: inteiro com o intervalo máximo em dias sob frio e umidade.
     * need: "Baixa", "Moderada" ou "Alta".
     * checkMethod: método prático de teste do solo (dedo/palito).
     * frequency: descrição textual clara (ex: "A cada 15 a 20 dias, permitindo secagem completa do substrato").
     * alert: aviso destacando que a rega deve seguir a umidade do substrato e as condições do ambiente, e não uma obrigação fixa.

2. TOXICIDADE E SEGURANÇA (PETS E CRIANÇAS):
   - Avalie rigorosamente a segurança toxicológica (baseada em fontes como ASPCA e literatura botânica/veterinária).
   - Diferencie informações confirmadas de riscos e informações desconhecidas.
   - NUNCA classifique como "segura" se houver princípios tóxicos conhecidos ou se a espécie não tiver dados documentados suficientes.
   - level: "toxica" | "moderadamente_toxica" | "possivel_risco" | "segura" | "desconhecida".
   - toxicToPets: boolean ou null (true para tóxica a cães/gatos, false para comprovadamente segura, null se desconhecido).
   - toxicToHumans: boolean ou null (true para tóxica a humanos/crianças, false para segura, null se desconhecido).
   - principles: substâncias ativas (ex: "Oxalato de cálcio insolúvel", "Saponinas", "Látex irritante", "Ausente / Não tóxica").
   - symptoms: sintomas em caso de ingestão ou contato.
   - warningText: recomendação clara de segurança (ex: "Mantenha fora do alcance de cães e gatos." ou "Espécie segura para animais domésticos.").

3. ILUMINAÇÃO, ADUBAÇÃO, SUBSTRATO, AMBIENTE E MANUTENÇÃO:
   - Forneça recomendações práticas e específicas para o táxon.

Responda ESTRITAMENTE em formato JSON.`;

    const candidateModels = ["gemini-3.8-flash", "gemini-3.6-flash"];
    let geminiResponse: any = null;
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout ao aguardar resposta do Gemini")), 3500)
        );

        geminiResponse = await Promise.race([
          ai.models.generateContent({
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
                      wateringDaysRecommended: { type: Type.INTEGER },
                      wateringDaysMin: { type: Type.INTEGER },
                      wateringDaysMax: { type: Type.INTEGER },
                    },
                    required: ["need", "checkMethod", "frequency", "alert", "wateringDaysRecommended"],
                  },
                  toxicity: {
                    type: Type.OBJECT,
                    properties: {
                      level: {
                        type: Type.STRING,
                        enum: ["toxica", "moderadamente_toxica", "possivel_risco", "segura", "desconhecida"],
                      },
                      toxicToPets: { type: Type.BOOLEAN },
                      toxicToHumans: { type: Type.BOOLEAN },
                      principles: { type: Type.STRING },
                      symptoms: { type: Type.STRING },
                      warningText: { type: Type.STRING },
                    },
                    required: ["level", "warningText"],
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
                  "toxicity",
                  "lighting",
                  "fertilization",
                  "substrate",
                  "environment",
                  "maintenance",
                  "confidenceNote",
                ],
              },
            },
          }),
          timeoutPromise,
        ]);

        if (geminiResponse?.text) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Tentativa com modelo ${model} falhou:`, err?.message || err);
      }
    }

    let parsed: any = null;
    if (geminiResponse?.text) {
      try {
        parsed = JSON.parse(geminiResponse.text);
      } catch (jsonErr) {
        console.warn("Erro ao fazer parse do JSON do Gemini:", jsonErr);
        parsed = null;
      }
    }

    // Helper: Botanical Taxonomy Grounding
    const nameLower = cleanScientificName.toLowerCase();
    const familyLower = (family ? String(family).toLowerCase() : "") + " " + (parsed?.family ? String(parsed.family).toLowerCase() : "");

    // 1. Classification of Botanical Water Profiles
    const isXerophytic =
      nameLower.includes("sansevieria") ||
      nameLower.includes("dracaena trifasciata") ||
      nameLower.includes("zamioculcas") ||
      nameLower.includes("echeveria") ||
      nameLower.includes("crassula") ||
      nameLower.includes("kalanchoe") ||
      nameLower.includes("sedum") ||
      nameLower.includes("haworthia") ||
      nameLower.includes("aloe") ||
      nameLower.includes("euphorbia") ||
      nameLower.includes("echinocactus") ||
      nameLower.includes("mammillaria") ||
      nameLower.includes("opuntia") ||
      familyLower.includes("cactaceae") ||
      familyLower.includes("crassulaceae") ||
      familyLower.includes("asphodelaceae");

    const isHighMoisture =
      nameLower.includes("nephrolepis") ||
      nameLower.includes("adiantum") ||
      nameLower.includes("platycerium") ||
      nameLower.includes("asplenium") ||
      nameLower.includes("calathea") ||
      nameLower.includes("maranta") ||
      nameLower.includes("goeppertia") ||
      nameLower.includes("dionaea") ||
      nameLower.includes("drosera") ||
      nameLower.includes("fittonia") ||
      familyLower.includes("nephrolepidaceae") ||
      familyLower.includes("polypodiaceae") ||
      familyLower.includes("marantaceae");

    if (!parsed) {
      console.warn("Sintetizando orientações através da base botânica estruturada:", lastError?.message || lastError);
      parsed = {
        scientificName: cleanScientificName,
        commonName: commonName ? String(commonName).trim() : undefined,
        family: family ? String(family).trim() : undefined,
        isWellKnownSpecies: true,
        watering: {
          need: isXerophytic ? "Baixa" : isHighMoisture ? "Alta" : "Moderada",
          wateringDaysRecommended: isXerophytic ? 15 : isHighMoisture ? 2 : 7,
          wateringDaysMin: isXerophytic ? 10 : isHighMoisture ? 1 : 5,
          wateringDaysMax: isXerophytic ? 22 : isHighMoisture ? 4 : 9,
          frequency: isXerophytic
            ? "A cada 15 a 20 dias, permitindo secagem completa do substrato"
            : isHighMoisture
            ? "A cada 2 a 3 dias, mantendo o substrato levemente úmido"
            : "A cada 6 a 8 dias, aguardando secagem da camada superior do solo",
          checkMethod: isXerophytic
            ? "Insira um palito até o fundo do vaso. Só regue se sair totalmente seco."
            : isHighMoisture
            ? "Toque a superfície do solo com a ponta dos dedos; regue assim que começar a secar."
            : "Insira o dedo 2-3 cm no solo. Se sair seco, regue até a água escorrer pelos orifícios.",
          alert: "Importante: a frequência é uma estimativa de referência. Sempre cheque a umidade do substrato antes de regar, pois temperatura, ventilação e tipo de vaso alteram o ritmo de secagem.",
        },
        lighting: {
          type: isXerophytic ? "Sol pleno ou meia-sombra abundante" : isHighMoisture ? "Luz indireta difusa ou meia-sombra" : "Luz indireta intensa",
          idealLocation: isXerophytic ? "Próximo a janelas ensolaradas" : "Ambientes claros sem sol direto incidente nas horas mais quentes",
          warning: "Evite mudanças bruscas de ambiente para não causar choque luminoso.",
        },
        fertilization: {
          type: isXerophytic ? "Adubo específico para cactos e suculentas" : "Adubo equilibrado NPK ou biofertilizante orgânico",
          frequency: "A cada 30 a 60 dias durante a primavera e verão",
          caution: "Nunca aplique adubo em solo ressecado.",
        },
        substrate: {
          drainage: isXerophytic ? "Drenagem altíssima" : "Boa drenagem com retenção de umidade",
          idealMix: isXerophytic ? "50% areia grossa/perlita + 50% substrato vegetal leve" : "Mistura aerada rica em matéria orgânica e perlita",
        },
        environment: {
          temperature: "18°C a 28°C",
          humidity: isXerophytic ? "Baixa a moderada" : isHighMoisture ? "Alta (acima de 60%)" : "Moderada",
          warning: "Proteja contra geadas e ventos frios no inverno.",
        },
        maintenance: {
          pruning: "Remoção de folhas secas na base da haste",
          repotting: "Troca de vaso a cada 1 a 2 anos",
        },
        confidenceNote: "Orientações fundamentadas na base taxonômica botânica do PlantAI.",
      };
    }

    let groundedDays = typeof parsed.watering?.wateringDaysRecommended === "number" && parsed.watering.wateringDaysRecommended > 0
      ? parsed.watering.wateringDaysRecommended
      : 7;

    let groundedNeed = String(parsed.watering?.need || "Moderada");
    let groundedFrequency = String(parsed.watering?.frequency || "Conforme a umidade do substrato");

    if (isXerophytic) {
      if (groundedDays < 12) {
        groundedDays = nameLower.includes("zamioculcas") || nameLower.includes("sansevieria") || familyLower.includes("cactaceae") ? 15 : 12;
      }
      groundedNeed = "Baixa";
      if (!groundedFrequency.includes("15") && !groundedFrequency.includes("20") && !groundedFrequency.includes("semanas")) {
        groundedFrequency = `A cada ${groundedDays} a 20 dias, esperando o solo secar completamente`;
      }
    } else if (isHighMoisture) {
      if (groundedDays > 5) {
        groundedDays = nameLower.includes("calathea") || nameLower.includes("maranta") ? 4 : 2;
      }
      groundedNeed = "Alta";
      if (!groundedFrequency.includes("2") && !groundedFrequency.includes("3") && !groundedFrequency.includes("4")) {
        groundedFrequency = `A cada ${groundedDays} a 3 dias, mantendo o substrato levemente úmido`;
      }
    }

    // Toxicity Grounding
    let parsedToxicity = parsed.toxicity;
    if (!parsedToxicity || typeof parsedToxicity !== "object") {
      parsedToxicity = {
        level: "desconhecida",
        toxicToPets: null,
        toxicToHumans: null,
        warningText: "Dados de toxicidade insuficientes. Por precaução, mantenha fora do alcance de animais e crianças.",
      };
    }

    // Grounded Toxicity Rules for High-Profile Domestic Species
    if (nameLower.includes("dieffenbachia")) {
      parsedToxicity = {
        level: "toxica",
        toxicToPets: true,
        toxicToHumans: true,
        principles: "Cristais de oxalato de cálcio insolúveis e enzimas proteolíticas",
        symptoms: "Dor e ardência oral severa, salivação abundante, edema de lábios e língua com risco de asfixia",
        warningText: "Alta toxicidade para cães, gatos e crianças. Manter totalmente fora do alcance.",
      };
    } else if (
      nameLower.includes("monstera") ||
      nameLower.includes("philodendron") ||
      nameLower.includes("epipremnum") ||
      nameLower.includes("syngonium") ||
      nameLower.includes("zamioculcas") ||
      nameLower.includes("spathiphyllum") ||
      nameLower.includes("anthurium") ||
      familyLower.includes("araceae")
    ) {
      parsedToxicity = {
        level: "moderadamente_toxica",
        toxicToPets: true,
        toxicToHumans: true,
        principles: "Cristais de oxalato de cálcio insolúveis (ráfides)",
        symptoms: "Irritação mecânica oral, salivação excessiva, vômito e desconforto ao engolir",
        warningText: "Tóxica para cães e gatos em caso de mastigação. Mantenha em prateleiras elevadas.",
      };
    } else if (nameLower.includes("sansevieria") || nameLower.includes("dracaena trifasciata")) {
      parsedToxicity = {
        level: "moderadamente_toxica",
        toxicToPets: true,
        toxicToHumans: true,
        principles: "Saponinas esteroidais e oxalato de cálcio",
        symptoms: "Salivação, náusea, vômito e diarreia",
        warningText: "Tóxica para animais domésticos. Mantenha longe de cães e gatos que mastigam folhas.",
      };
    } else if (
      nameLower.includes("calathea") ||
      nameLower.includes("maranta") ||
      nameLower.includes("goeppertia") ||
      nameLower.includes("chlorophytum comosum") ||
      nameLower.includes("peperomia") ||
      nameLower.includes("nephrolepis exaltata") ||
      nameLower.includes("pilea peperomioides") ||
      nameLower.includes("saintpaulia") ||
      nameLower.includes("phalaenopsis")
    ) {
      parsedToxicity = {
        level: "segura",
        toxicToPets: false,
        toxicToHumans: false,
        principles: "Não contém princípios tóxicos documentados",
        symptoms: "Segura em caso de mastigação acidental",
        warningText: "Espécie pet-friendly: segura para cães e gatos de acordo com os registros da ASPCA.",
      };
    }

    const guideData = {
      scientificName: parsed.scientificName || cleanScientificName,
      commonName: parsed.commonName || (commonName ? String(commonName) : undefined),
      family: parsed.family || (family ? String(family) : undefined),
      isWellKnownSpecies: Boolean(parsed.isWellKnownSpecies),
      watering: {
        need: groundedNeed,
        checkMethod: String(
          parsed.watering?.checkMethod ||
            (isXerophytic
              ? "Insira um palito até o fundo do vaso. Regue apenas se sair totalmente seco e limpo."
              : "Verifique a umidade inserindo o dedo 2-3 cm no solo. Se sair seco, regue.")
        ),
        frequency: groundedFrequency,
        alert: String(
          parsed.watering?.alert ||
            "Importante: a frequência é uma estimativa de referência. Sempre cheque a umidade do substrato antes de regar, pois temperatura, ventilação e tipo de vaso alteram o ritmo de secagem."
        ),
        wateringDaysRecommended: groundedDays,
        wateringDaysMin: typeof parsed.watering?.wateringDaysMin === "number" ? parsed.watering.wateringDaysMin : Math.max(1, Math.round(groundedDays * 0.7)),
        wateringDaysMax: typeof parsed.watering?.wateringDaysMax === "number" ? parsed.watering.wateringDaysMax : Math.round(groundedDays * 1.4),
      },
      toxicity: {
        level: parsedToxicity.level || "desconhecida",
        toxicToPets: parsedToxicity.toxicToPets ?? null,
        toxicToHumans: parsedToxicity.toxicToHumans ?? null,
        principles: parsedToxicity.principles ? String(parsedToxicity.principles) : undefined,
        symptoms: parsedToxicity.symptoms ? String(parsedToxicity.symptoms) : undefined,
        warningText: String(parsedToxicity.warningText || "Verifique a segurança botânica antes de deixar ao alcance de pets."),
      },
      lighting: {
        type: String(parsed.lighting?.type || (isXerophytic ? "Sol pleno ou meia-sombra abundante" : "Luz indireta")),
        idealLocation: String(parsed.lighting?.idealLocation || "Próximo a janelas bem iluminadas"),
        warning: String(parsed.lighting?.warning || "Evite mudanças bruscas de iluminação para não estressar a planta."),
      },
      fertilization: {
        type: String(parsed.fertilization?.type || (isXerophytic ? "Adubo para cactos e suculentas" : "NPK equilibrado ou adubo orgânico")),
        frequency: String(parsed.fertilization?.frequency || "A cada 30 a 60 dias no período de crescimento"),
        caution: String(
          parsed.fertilization?.caution ||
            "Nunca adube em solo ressecado e respeite a dosagem recomendada pelo fabricante."
        ),
      },
      substrate: {
        drainage: String(parsed.substrate?.drainage || (isXerophytic ? "Drenagem altíssima (areia, perlita e cactos)" : "Boa drenagem")),
        idealMix: String(
          parsed.substrate?.idealMix ||
            (isXerophytic
              ? "50% areia grossa/perlita + 50% substrato vegetal leve"
              : "Mistura aerada com matéria orgânica, perlita e casca de pinus")
        ),
      },
      environment: {
        temperature: String(parsed.environment?.temperature || "18°C a 27°C"),
        humidity: String(parsed.environment?.humidity || (isXerophytic ? "Baixa a moderada" : "Moderada a alta")),
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

    const candidateModels = ["gemini-3.8-flash", "gemini-3.6-flash"];
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
