import { mockProviders, sectorsCoordinates } from "../data/mockProviders";

// Core Agent Orchestrator class in the style of Google Antigravity
// 100% Evacuated from Google Cloud: Runs fully offline and self-hosted
export class ServiceOrchestrator {
  constructor(onTraceUpdate, onStateChange, firestoreDb = null) {
    this.onTraceUpdate = onTraceUpdate; // callback to push logs to UI
    this.onStateChange = onStateChange; // callback for database state updates
    this.traceLogs = [];
    this.activeWorkplan = [];
    this.activeTasks = [];
  }

  // Visual helper to log agent thoughts
  logAgentTrace(agent, action, details, reasoning = "", tool = null) {
    const log = {
      timestamp: new Date().toLocaleTimeString(),
      agent,
      action,
      details,
      reasoning,
      tool
    };
    this.traceLogs.push(log);
    this.onTraceUpdate([...this.traceLogs]);
  }

  // Visual helper to set workplan
  setWorkplan(steps) {
    this.activeWorkplan = steps;
    this.activeTasks = steps.map(s => ({ text: s, status: "pending" }));
    this.onStateChange({ workplan: this.activeWorkplan, tasks: this.activeTasks });
  }

  updateTaskStatus(stepIndex, status) {
    if (this.activeTasks[stepIndex]) {
      this.activeTasks[stepIndex].status = status;
      this.onStateChange({ tasks: [...this.activeTasks] });
    }
  }

  // Multilingual Intent Understanding Agent (Local Slang / Ollama / Groq Engine)
  async parseIntent(rawInput, nlpConfig = { mode: "regex" }, chatHistory = [], previousIntent = null) {
    this.logAgentTrace("IntentAgent", "Parsing User Request", `Input: "${rawInput}" (NLP Mode: ${nlpConfig.mode || "regex"})`, "Understanding natural language request across Urdu, Roman Urdu, and English.");
    
    // Start trace logs
    this.setWorkplan([
      "Understand user intent and extract details",
      "Discover and rank service providers via Maps & multi-factor weights",
      "Calculate dynamic and fair price quote",
      "Simulate booking calendar slot & send notifications",
      "Monitor booking and execute follow-up checklists",
      "Handle post-service feedback or potential disputes"
    ]);

    this.updateTaskStatus(0, "in-progress");

    const systemPrompt = `You are an expert conversational intent parser for 'Hamara-Rozgar' (an informal services marketplace in Islamabad, Pakistan).
Your job is to parse the user's natural language request (which could be in English, Urdu, or Roman Urdu) and output a JSON object containing the parsed intent properties.

The user might be in a multi-turn conversation where they refine details of an ongoing request. For example:
1. They might first request a service (e.g. "meri gaadi ka tyre puncture ho gya hai", mapping to "Mechanic").
2. Then they might follow up to specify or refine their location (e.g. "main sector 4 airport society mein rehta hu").
You MUST analyze the whole conversation history (the preceding turns provided in the chat history) to extract and maintain context.
If the latest user request is purely a location/address refinement (e.g. "main sector 4 airport society mein rehta hu"), you must KEEP the "service" category from the previous turn (e.g. "Mechanic") and update the "location" to the new value!

The JSON object must have exactly the following structure:
{
  "service": "AC Technician" | "Electrician" | "Plumber" | "Tutor" | "Beautician" | "Mechanic",
  "location": string (can be a standard sector format like "G-13", "F-10", "I-8", "G-11", "E-11" or any custom sector or address string like "sector 4 airport society" or "airport society sector 4"),
  "time": string (e.g. "Immediately", "Tomorrow Morning (10:00 AM)", "Evening (05:00 PM)", or a short description parsed from input),
  "severity": "high" | "medium",
  "priceSensitivity": "high" | "medium",
  "confidence": number (between 0.0 and 1.0 representing how confident you are in this parsing)
}

Rules for Service mapping:
- If user mentions AC, air conditioner, cooling, filter, gas leakage, or cooling repair -> "AC Technician"
- If user mentions plumber, pipe, leakage, tap, water tank, toti, bathroom leak, washroom block, pipe leak -> "Plumber"
- If user mentions electrician, short circuit, switch, light, fan, board, wire, pankha, bijli, power -> "Electrician"
- If user mentions tutor, study, teach, teacher, class, math, physics, parhana, tuition -> "Tutor"
- If user mentions beautician, makeup, facial, hair, nails, parlor, makeup artist, glow, salon -> "Beautician"
- If user mentions mechanic, car, motorcycle, bike, engine, puncture, tuning, mobil oil, break, khrab, repair -> "Mechanic"
- If the current message is a location refinement (like specifying an address) and doesn't specify a new service, inherit the service from the previous conversation turns (e.g. "Mechanic" or "Plumber").

Rules for Location mapping:
- Extract the location string. If it's a standard sector like G-13, F-10, I-8, G-11, E-11, format it as "G-13", "F-10", "I-8", "G-11", "E-11".
- If it is a custom location or address (e.g. "sector 4 airport society" or "airport society"), extract it EXACTLY as the user typed or described it (e.g. "sector 4 airport society"). Do NOT default it to G-13 if they named a specific custom place!

Rules for Urgency/Time mapping:
- If the user says "urgent", "abbi", "fauri", "right now", "fauran", or similar -> severity should be "high", time should be "Immediately".
- Otherwise, map to "Tomorrow Morning (10:00 AM)", "Evening (05:00 PM)", or whatever they requested.

Rules for Price Sensitivity:
- If the user says "budget", "sasta", "cheap", "kam price", "zyada nahi", "سستا", or similar -> priceSensitivity should be "high".
- Otherwise, priceSensitivity should be "medium".

Provide ONLY the raw JSON output. No markdown wrappers, no backticks, just valid JSON.`;

    // 1. Ollama Self-Hosted local LLM parser
    if (nlpConfig.mode === "ollama") {
      this.logAgentTrace(
        "IntentAgent",
        "Ollama Local LLM Parsing Triggered",
        `Querying local Ollama server at ${nlpConfig.ollamaUrl || "http://localhost:11434"} with model "${nlpConfig.ollamaModel || "llama3"}"`,
        "Running fully private, self-hosted intent understanding without cloud round-trips.",
        "Ollama Engine"
      );

      try {
        const response = await fetch(`${nlpConfig.ollamaUrl || "http://localhost:11434"}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: nlpConfig.ollamaModel || "llama3",
            system: systemPrompt,
            prompt: `Analyze this active user query: "${rawInput}". Preceding conversation history: ${JSON.stringify(chatHistory)}. Output raw JSON structure only.`,
            stream: false,
            options: { temperature: 0.1 },
            format: "json"
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const parsedIntent = JSON.parse(data.response.trim());
        return this.sanitizeParsedIntent(parsedIntent, previousIntent, "Ollama Local LLM");

      } catch (err) {
        this.logAgentTrace(
          "IntentAgent",
          "Ollama Parsing Failed",
          err.message,
          "Gracefully falling back to local high-fidelity regex slang parser.",
          "Ollama Fallback"
        );
      }
    }

    // 2. Groq Cloud free-tier Open LLM parser
    if (nlpConfig.mode === "groq" && nlpConfig.groqKey) {
      this.logAgentTrace(
        "IntentAgent",
        "Groq Cloud Free API Parsing Triggered",
        "Sending context packet to Groq's high-speed Llama 3 processor.",
        "Querying open-weights model via ultra-fast developer API endpoints.",
        "Groq Llama-3 API"
      );

      try {
        const chatMessages = [
          { role: "system", content: systemPrompt }
        ];

        if (chatHistory && chatHistory.length > 0) {
          chatHistory.forEach(msg => {
            chatMessages.push({
              role: msg.sender === "user" ? "user" : "assistant",
              content: msg.text.replace(/\*\*/g, "")
            });
          });
        }

        chatMessages.push({ role: "user", content: rawInput });

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${nlpConfig.groqKey}`
          },
          body: JSON.stringify({
            model: "llama3-8b-8192",
            messages: chatMessages,
            temperature: 0.1,
            response_format: { type: "json_object" }
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const responseText = data.choices?.[0]?.message?.content;
        if (!responseText) {
          throw new Error("Empty response from Groq API");
        }

        const parsedIntent = JSON.parse(responseText.trim());
        return this.sanitizeParsedIntent(parsedIntent, previousIntent, "Groq Llama 3");

      } catch (err) {
        this.logAgentTrace(
          "IntentAgent",
          "Groq Parsing Failed",
          err.message,
          "Gracefully falling back to local high-fidelity regex slang parser.",
          "Groq Fallback"
        );
      }
    }

    // 3. Local Regex / Slang parsing (offline fallback & ultra-fast matching)
    let service = previousIntent?.service || "AC Technician"; // carry over previous or default
    let location = previousIntent?.location || "G-13"; // carry over previous or default
    let time = previousIntent?.time || "Tomorrow morning";
    let severity = previousIntent?.severity || "medium";
    let priceSensitivity = previousIntent?.priceSensitivity || "medium";
    let confidence = 0.85;

    const lowerInput = rawInput.toLowerCase();

    // Service detection
    let matchedService = null;
    if (lowerInput.includes("ac") || lowerInput.includes("air conditioner") || lowerInput.includes("ایسی") || lowerInput.includes("cooling") || lowerInput.includes("cooler")) {
      matchedService = "AC Technician";
    } else if (lowerInput.includes("plumber") || lowerInput.includes("pipe") || lowerInput.includes("leakage") || lowerInput.includes("नल") || lowerInput.includes("پلمبر") || lowerInput.includes("toti") || lowerInput.includes("leak") || lowerInput.includes("pani") || lowerInput.includes("water") || lowerInput.includes("bathroom") || lowerInput.includes("shower") || lowerInput.includes("washroom") || lowerInput.includes("tap") || lowerInput.includes("nalka") || lowerInput.includes("gusal khana")) {
      matchedService = "Plumber";
    } else if (lowerInput.includes("electrician") || lowerInput.includes("short circuit") || lowerInput.includes("bijli") || lowerInput.includes("الیکٹریشن") || lowerInput.includes("board") || lowerInput.includes("fan") || lowerInput.includes("wire") || lowerInput.includes("pankha") || lowerInput.includes("light") || lowerInput.includes("switch") || lowerInput.includes("button") || lowerInput.includes("fuse")) {
      matchedService = "Electrician";
    } else if (lowerInput.includes("tutor") || lowerInput.includes("parhana") || lowerInput.includes("teacher") || lowerInput.includes("ٹیوٹر") || lowerInput.includes("پڑھانا") || lowerInput.includes("study") || lowerInput.includes("math") || lowerInput.includes("physics") || lowerInput.includes("tuition") || lowerInput.includes("class")) {
      matchedService = "Tutor";
    } else if (lowerInput.includes("beautician") || lowerInput.includes("makeup") || lowerInput.includes("glow") || lowerInput.includes("بیوٹیشن") || lowerInput.includes("facial") || lowerInput.includes("salon") || lowerInput.includes("parlor") || lowerInput.includes("nails")) {
      matchedService = "Beautician";
    } else if (lowerInput.includes("mechanic") || lowerInput.includes("car") || lowerInput.includes("gari") || lowerInput.includes("مکینک") || lowerInput.includes("motorcycle") || lowerInput.includes("bike") || lowerInput.includes("puncture") || lowerInput.includes("engine") || lowerInput.includes("tuning") || lowerInput.includes("mobil oil")) {
      matchedService = "Mechanic";
    }

    if (matchedService) {
      service = matchedService;
      confidence = 0.85;
    } else if (!previousIntent) {
      confidence = 0.5;
    } else {
      confidence = 0.90;
    }

    // Location detection
    const sectors = ["g-13", "f-10", "i-8", "g-11", "e-11"];
    let foundSector = sectors.find(s => lowerInput.includes(s));
    if (foundSector) {
      location = foundSector.toUpperCase();
    } else if (lowerInput.includes("g13")) location = "G-13";
    else if (lowerInput.includes("f10")) location = "F-10";
    else if (lowerInput.includes("i8")) location = "I-8";
    else if (lowerInput.includes("g11")) location = "G-11";
    else if (lowerInput.includes("e11")) location = "E-11";
    else {
      // Check for common Urdu/Roman Urdu address patterns
      const addressTriggers = ["rehta hu", "rehta hoon", "address hai", "location hai", "society", "sector", "gali", "house", "hno", "h #"];
      const hasAddressTrigger = addressTriggers.some(trigger => lowerInput.includes(trigger));
      if (hasAddressTrigger) {
        let cleanLoc = rawInput;
        const stopwords = ["main ", "mein ", " rehta", " hu", " hoon", " address hai", " location hai", " hai", "mujhye", "mujhe", "chahye", "chahiye"];
        stopwords.forEach(word => {
          cleanLoc = cleanLoc.replace(new RegExp(word, "gi"), "");
        });
        cleanLoc = cleanLoc.trim();
        if (cleanLoc.length > 3) {
          location = cleanLoc;
        }
      }
    }

    // Urgency & Time detection
    if (lowerInput.includes("urgent") || lowerInput.includes("abbi") || lowerInput.includes("fauri") || lowerInput.includes("right now") || lowerInput.includes("فوری")) {
      time = "Immediately";
      severity = "high";
    } else if (lowerInput.includes("kal subah") || lowerInput.includes("tomorrow morning") || lowerInput.includes("کل صبح")) {
      time = "Tomorrow Morning (10:00 AM)";
    } else if (lowerInput.includes("sham") || lowerInput.includes("evening") || lowerInput.includes("شام")) {
      time = "Evening (05:00 PM)";
    }

    // Budget / Price sensitivity
    if (lowerInput.includes("budget") || lowerInput.includes("sasta") || lowerInput.includes("cheap") || lowerInput.includes("zyada nahi") || lowerInput.includes("سستا")) {
      priceSensitivity = "high";
    }

    const resultIntent = { service, location, time, severity, priceSensitivity, confidence };

    this.logAgentTrace(
      "IntentAgent",
      "Intent Extracted via Regex Parser",
      JSON.stringify(resultIntent),
      `Confidence: ${confidence * 100}%. Successfully mapped local offline strings.`,
      "Offline Slang Parser"
    );

    this.updateTaskStatus(0, "completed");
    return resultIntent;
  }

  // Sanitizes structural LLM outputs
  sanitizeParsedIntent(parsedIntent, previousIntent, engineName) {
    const validServices = ["AC Technician", "Electrician", "Plumber", "Tutor", "Beautician", "Mechanic"];
    if (!validServices.includes(parsedIntent.service)) {
      parsedIntent.service = previousIntent?.service || "AC Technician";
    }
    if (!parsedIntent.location) {
      parsedIntent.location = previousIntent?.location || "G-13";
    }
    parsedIntent.confidence = parsedIntent.confidence || 0.95;
    parsedIntent.severity = parsedIntent.severity || previousIntent?.severity || "medium";
    parsedIntent.priceSensitivity = parsedIntent.priceSensitivity || previousIntent?.priceSensitivity || "medium";

    this.logAgentTrace(
      "IntentAgent",
      `${engineName} Intent Parsed Successfully`,
      JSON.stringify(parsedIntent),
      `Confidence: ${parsedIntent.confidence * 100}%. Rich semantic matching executed successfully via ${engineName}.`,
      `${engineName} Parser`
    );

    this.updateTaskStatus(0, "completed");
    return parsedIntent;
  }

  // Haversine Distance helper for geographical Maps simulation
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return parseFloat((R * c).toFixed(1));
  }

  // OpenStreetMap Nominatim Live Geocoding API (100% Open-Source & Free)
  async getCoordinates(locationName, mapConfig = { mode: "osm" }) {
    if (mapConfig.mode === "offline") {
      this.logAgentTrace("DiscoveryAgent", "Offline Geocoding Activated", `Resolving sector coordinates for "${locationName}" from local dictionary.`);
      return sectorsCoordinates[locationName] || sectorsCoordinates["G-13"];
    }

    this.logAgentTrace(
      "DiscoveryAgent",
      "Geocoding Custom Location via OSM",
      `Querying OpenStreetMap Nominatim for "${locationName}, Islamabad, Pakistan"`,
      "Converting custom address / sector string to high-precision latitude & longitude coordinate points via open-source index.",
      "OpenStreetMap Nominatim"
    );
    try {
      const queryUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName + ", Islamabad, Pakistan")}&format=json&limit=1`;
      const response = await fetch(queryUrl, {
        headers: {
          "User-Agent": "HamaraRozgar/1.0 (ammarasad2005@gmail.com)"
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      if (data && data.length > 0) {
        const result = data[0];
        const coords = { latitude: parseFloat(result.lat), longitude: parseFloat(result.lon) };
        this.logAgentTrace(
          "DiscoveryAgent",
          "Geocoding Succeeded",
          `OSM Coordinates: ${coords.latitude}, ${coords.longitude} for "${locationName}"`,
          "Successfully parsed dynamic open-source coordinates.",
          "OSM Nominatim API"
        );
        return coords;
      } else {
        throw new Error("No OSM results matched the address");
      }
    } catch (err) {
      this.logAgentTrace(
        "DiscoveryAgent",
        "Geocoding Failed",
        err.message,
        "Using default fallback sector coordinate system.",
        "OSM Fallback"
      );
      return sectorsCoordinates[locationName] || sectorsCoordinates["G-13"];
    }
  }

  // OpenStreetMap Live Service Provider Query
  async fetchLiveProvidersFromPlaces(service, locationName, mapConfig = { mode: "osm" }) {
    if (mapConfig.mode === "offline") {
      return null; // fallback to high-fidelity mock database
    }

    this.logAgentTrace(
      "DiscoveryAgent", 
      "Live OSM Provider Search Triggered", 
      `Querying OpenStreetMap Nominatim for "${service} in ${locationName}, Islamabad"`, 
      "Making an open-source request to search for nearby craft / service businesses on OSM.", 
      "OSM Nominatim API"
    );

    try {
      const queryUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(service + " in " + locationName + ", Islamabad")}&format=json&limit=5`;
      const response = await fetch(queryUrl, {
        headers: {
          "User-Agent": "HamaraRozgar/1.0 (ammarasad2005@gmail.com)"
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data || data.length === 0) {
        this.logAgentTrace("DiscoveryAgent", "OSM Provider Search Empty", "No physical businesses matched query on OpenStreetMap. Falling back to local high-fidelity registry.");
        return null;
      }

      // Map OpenStreetMap POI results to our provider structure
      return data.map((poi, idx) => {
        const name = poi.display_name.split(",")[0] || `${service} Specialist #${idx + 1}`;
        const rating = parseFloat((4.0 + Math.random() * 0.9).toFixed(1));
        const reviewCount = Math.floor(5 + Math.random() * 45);
        const lat = parseFloat(poi.lat);
        const lng = parseFloat(poi.lon);

        return {
          id: `osm-p-${idx}-${Date.now()}`,
          name,
          specialization: service,
          baseRate: service === "AC Technician" ? 1500 : service === "Plumber" ? 1000 : 1200, 
          rating,
          reliabilityScore: Math.floor(92 + Math.random() * 8), 
          cancellationRate: Math.floor(Math.random() * 4), 
          availability: ["10:00 AM", "12:00 PM", "03:00 PM", "05:00 PM"],
          location: locationName,
          latitude: lat,
          longitude: lng,
          phone: `+92 300 ${Math.floor(1000000 + Math.random() * 9000000)}`,
          experienceYears: Math.floor(6 + Math.random() * 8),
          toolsProvided: true,
          certifications: ["OpenStreetMap verified listing"],
          reviews: [
            { user: "OSM Contributor", rating: Math.round(rating), comment: `Verified open-source location. Found at ${poi.display_name.split(",").slice(1, 3).join(",")}.`, date: "2026-05-21" }
          ]
        };
      });
    } catch (err) {
      this.logAgentTrace("DiscoveryAgent", "OSM Provider Search Failed", err.message, "Falling back to local high-fidelity registry.");
      return null;
    }
  }

  // Multi-factor Matching and Ranking Agent (OSM + Local Hybrid)
  async discoverAndRank(intent, mapConfig = { mode: "osm" }, activeCoords = null) {
    this.updateTaskStatus(1, "in-progress");
    this.logAgentTrace(
      "DiscoveryAgent",
      "Scanning Provider Registry",
      `Specialization: "${intent.service}", Target Sector: "${intent.location}" (Map Mode: ${mapConfig.mode || "osm"})`,
      "Evaluating registry using 6 operational factors: distance, rating, availability, reliability, pricing, and cancellation history.",
      "Maps/Places API"
    );

    let targetCoords = null;
    if (activeCoords) {
      targetCoords = activeCoords;
      this.logAgentTrace(
        "DiscoveryAgent",
        "Using Active Coordinates Lock",
        `Coordinates: ${targetCoords.latitude}, ${targetCoords.longitude}`,
        "Applying dynamic location coordinates for distance and match calculations.",
        "Proximity Hub"
      );
    } else {
      targetCoords = sectorsCoordinates[intent.location];
    }

    if (!targetCoords && mapConfig.mode === "osm") {
      targetCoords = await this.getCoordinates(intent.location, mapConfig);
    }
    if (!targetCoords) {
      targetCoords = sectorsCoordinates["G-13"]; // ultimate fallback
    }

    let matches = [];

    // If OpenStreetMap search is active, attempt to fetch live local businesses from OSM
    if (mapConfig.mode === "osm") {
      const liveProviders = await this.fetchLiveProvidersFromPlaces(intent.service, intent.location, mapConfig);
      if (liveProviders && liveProviders.length > 0) {
        matches = liveProviders;
        this.logAgentTrace(
          "DiscoveryAgent",
          "Live OSM Providers Loaded",
          `Fetched ${liveProviders.length} active physical businesses from OpenStreetMap Nominatim.`,
          "Now executing 6-factor multi-attribute utility calculation on live open-source dataset."
        );
      }
    }

    // Fallback to local mock database if offline or API failed
    if (matches.length === 0) {
      matches = mockProviders.filter(p => p.specialization === intent.service);
    }

    if (matches.length === 0) {
      this.logAgentTrace("DiscoveryAgent", "No Providers Found", "Fallback mode triggered.", "Checking adjoining sectors or waitlisting.");
      this.updateTaskStatus(1, "failed");
      return [];
    }

    // Rank matching providers
    const ranked = matches.map(provider => {
      // Calculate distance simulation
      const dist = this.calculateDistance(
        targetCoords.latitude,
        targetCoords.longitude,
        provider.latitude,
        provider.longitude
      );

      // Score weightings:
      // 1. Distance (lower is better) - Weight: 25%
      const distanceScore = Math.max(0, 100 - dist * 10);
      // 2. Rating (higher is better) - Weight: 20%
      const ratingScore = provider.rating * 20;
      // 3. Reliability (higher is better) - Weight: 20%
      const reliabilityScore = provider.reliabilityScore;
      // 4. Pricing (lower rate is better for budget sensitive users) - Weight: 15%
      const rateScore = intent.priceSensitivity === "high" ? Math.max(0, 100 - (provider.baseRate / 30)) : 80;
      // 5. Cancellation Rate (lower is better) - Weight: 10%
      const cancelScore = 100 - provider.cancellationRate * 5;
      // 6. Direct Sector Match (same sector gets extra weight) - Weight: 10%
      const sectorScore = provider.location === intent.location ? 100 : 40;

      const totalScore = (
        distanceScore * 0.25 +
        ratingScore * 0.20 +
        reliabilityScore * 0.20 +
        rateScore * 0.15 +
        cancelScore * 0.10 +
        sectorScore * 0.10
      );

      return {
        ...provider,
        calculatedDistance: dist,
        matchScore: parseFloat(totalScore.toFixed(1)),
        rankingReason: `${provider.name} is ${dist} km away in ${provider.location} with a rating of ${provider.rating} and on-time score of ${provider.reliabilityScore}%.`
      };
    }).sort((a, b) => b.matchScore - a.matchScore);

    this.logAgentTrace(
      "DiscoveryAgent",
      "Ranking Completed",
      `Best recommendation: ${ranked[0].name} (Score: ${ranked[0].matchScore})`,
      `Ranked ${ranked.length} candidates. Selected top provider based on optimal travel metrics and rating coefficients.`,
      "Ranking Algorithm"
    );

    this.updateTaskStatus(1, "completed");
    return ranked;
  }

  // Dynamic Pricing Agent
  calculatePricing(provider, intent) {
    this.updateTaskStatus(2, "in-progress");
    this.logAgentTrace(
      "PricingAgent",
      "Calculating Custom Quote",
      `Base rate: ${provider.baseRate} PKR, Distance: ${provider.calculatedDistance} km`,
      "Evaluating surcharges, loyalty discounts, and distance travel allowances.",
      "Billing Module"
    );

    const baseRate = provider.baseRate;
    const distanceCost = Math.round(provider.calculatedDistance * 50); // 50 PKR per km
    let urgencySurcharge = 0;
    let surgeSurplus = 0;
    let loyaltyDiscount = 0;

    // Urgency surcharge (+30%)
    if (intent.severity === "high" || intent.time === "Immediately") {
      urgencySurcharge = Math.round(baseRate * 0.3);
    }

    // High demand surge simulation
    if (mockProviders.filter(p => p.specialization === intent.service).length < 3) {
      surgeSurplus = Math.round(baseRate * 0.15); // +15% surge
    }

    // Loyalty discount (10%)
    loyaltyDiscount = Math.round((baseRate + distanceCost + urgencySurcharge) * 0.1);

    const total = baseRate + distanceCost + urgencySurcharge + surgeSurplus - loyaltyDiscount;

    const quote = {
      baseRate,
      distanceCost,
      urgencySurcharge,
      surgeSurplus,
      loyaltyDiscount,
      totalPrice: total
    };

    this.logAgentTrace(
      "PricingAgent",
      "Quote Generated",
      `Total Quote: ${total} PKR`,
      `Includes base rate of ${baseRate} PKR, travel allowance of ${distanceCost} PKR, and loyalty deduction of ${loyaltyDiscount} PKR.`,
      "Pricing Logic"
    );

    this.updateTaskStatus(2, "completed");
    return quote;
  }

  // Booking Simulation Agent (LocalStorage Persistence)
  async simulateBooking(provider, pricing, intent, activeCoords = null) {
    this.updateTaskStatus(3, "in-progress");
    this.logAgentTrace(
      "BookingAgent",
      "Reserving Slot",
      `Provider: ${provider.name}, Slot: ${provider.availability[0]}`,
      "Updating operational calendar sheet and writing record to transaction ledger.",
      "Database / Spreadsheet Tool"
    );

    const bookingId = "BK-" + Math.floor(1000 + Math.random() * 9000);
    const newBooking = {
      id: bookingId,
      providerId: provider.id,
      providerName: provider.name,
      providerPhone: provider.phone,
      service: intent.service,
      location: intent.location,
      locationCoords: activeCoords,
      timeSlot: provider.availability[0],
      pricing,
      status: "Confirmed",
      timestamp: new Date().toLocaleString()
    };

    // Save booking records to localStorage to keep it 100% self-hosted & serverless
    try {
      const existingBookings = JSON.parse(localStorage.getItem("hamara_rozgar_bookings") || "[]");
      existingBookings.push(newBooking);
      localStorage.setItem("hamara_rozgar_bookings", JSON.stringify(existingBookings));
      
      this.logAgentTrace(
        "BookingAgent", 
        "Local Ledger Database Write Succeeded", 
        `Doc ID: ${newBooking.id} (Saved to Web Storage)`, 
        "Successfully committed transaction record to persistent local browser ledger storage.", 
        "Local Storage API"
      );
    } catch (err) {
      this.logAgentTrace("BookingAgent", "Local Ledger Write Failed", err.message, "Local Storage write error.", "Local Storage API");
    }

    this.logAgentTrace(
      "BookingAgent",
      "Sending Notification Alert",
      `WhatsApp message triggered to customer & provider`,
      `Hi ${provider.name}, you have a new booking in ${intent.location} at ${provider.availability[0]}. Dynamic Rate: ${pricing.totalPrice} PKR.`,
      "Messaging API"
    );

    this.updateTaskStatus(3, "completed");
    return newBooking;
  }

  // Service Follow-Up Loop
  simulateServiceProgress(booking, onStatusUpdate) {
    this.updateTaskStatus(4, "in-progress");
    this.logAgentTrace("FollowupAgent", "Initiating Tracking Workflow", `Booking ID: ${booking.id}`, "Monitoring provider status and en-route indicators.");

    // Step 1: En-Route (simulated after 4 seconds)
    setTimeout(() => {
      booking.status = "Provider En-Route";
      this.logAgentTrace(
        "FollowupAgent",
        "Provider En-Route",
        `${booking.providerName} is now moving towards your location in ${booking.location}. Estimated Arrival: 12 minutes.`,
        "Live location signals initialized.",
        "GPS Signal"
      );
      onStatusUpdate({ ...booking });
    }, 4000);

    // Step 2: Work Started (simulated after 9 seconds)
    setTimeout(() => {
      booking.status = "Work In Progress";
      this.logAgentTrace(
        "FollowupAgent",
        "Work Started",
        "Provider arrived, verified job card details, and commenced service.",
        "Checklist: Safety kit enabled, tools unboxed."
      );
      onStatusUpdate({ ...booking });
    }, 9000);

    // Step 3: Work Completed (simulated after 15 seconds)
    setTimeout(() => {
      booking.status = "Completed";
      this.logAgentTrace(
        "FollowupAgent",
        "Service Completed",
        "Checklist verified. Job successfully executed.",
        "Photo evidence unboxed. Billing receipt generated.",
        "Checklist Tool"
      );
      this.updateTaskStatus(4, "completed");
      this.updateTaskStatus(5, "in-progress");
      onStatusUpdate({ ...booking });
    }, 15000);
  }

  // Dispute and Fallback Agent
  async handleDispute(booking, type, details, onStatusUpdate, mapConfig = { mode: "osm" }, gpsCoords = null) {
    this.logAgentTrace(
      "DisputeAgent",
      "Dispute Triggered",
      `Type: ${type}, Details: ${details}`,
      "Analyzing case files, comparing historical ratings, and preparing refund/compensation credits."
    );

    if (type === "Provider Cancelled") {
      this.logAgentTrace(
        "DisputeAgent",
        "Auto-Rescheduling Triggered",
        "Searching for equivalent nearby providers.",
        "Compensating customer with free 150 PKR voucher for service delay."
      );

      // Search for next best candidate
      const nextCandidates = await this.discoverAndRank({
        service: booking.service,
        location: booking.location,
        time: booking.timeSlot,
        severity: "high",
        priceSensitivity: "medium"
      }, mapConfig, gpsCoords);

      const alternative = nextCandidates.find(p => p.id !== booking.providerId);
      if (alternative) {
        booking.providerId = alternative.id;
        booking.providerName = alternative.name;
        booking.providerPhone = alternative.phone;
        booking.status = "Re-assigned to " + alternative.name;
        
        // Update booking in local storage
        try {
          const existingBookings = JSON.parse(localStorage.getItem("hamara_rozgar_bookings") || "[]");
          const idx = existingBookings.findIndex(b => b.id === booking.id);
          if (idx !== -1) {
            existingBookings[idx] = booking;
            localStorage.setItem("hamara_rozgar_bookings", JSON.stringify(existingBookings));
          }
        } catch (_) {}

        this.logAgentTrace(
          "DisputeAgent",
          "Alternative Found",
          `Re-assigned booking to ${alternative.name}.`,
          "Successfully recovered service booking and dispatched new provider."
        );
      } else {
        booking.status = "Cancelled - Fully Refunded";
        this.logAgentTrace("DisputeAgent", "Recovery Failed", "No other providers available in the sector time-frame. Issuing complete billing refund.");
      }
      onStatusUpdate({ ...booking });
    } else if (type === "Price Disagreement") {
      booking.status = "Disputed - Pending Audit";
      booking.pricing.totalPrice = Math.round(booking.pricing.totalPrice * 0.9); // 10% discount to resolve conflict
      
      // Update booking in local storage
      try {
        const existingBookings = JSON.parse(localStorage.getItem("hamara_rozgar_bookings") || "[]");
        const idx = existingBookings.findIndex(b => b.id === booking.id);
        if (idx !== -1) {
          existingBookings[idx] = booking;
          localStorage.setItem("hamara_rozgar_bookings", JSON.stringify(existingBookings));
        }
      } catch (_) {}

      this.logAgentTrace(
        "DisputeAgent",
        "Resolution Proposal Transmitted",
        "10% operational discount applied to dynamic quote to satisfy customer budget request.",
        "System updated reputation index of provider."
      );
      onStatusUpdate({ ...booking });
    } else if (type === "Quality Complaint") {
      booking.status = "Disputed - Pending Review";
      this.logAgentTrace(
        "DisputeAgent",
        "Audit Triggered",
        "Escalating case logs to human administrator review panel.",
        "Provider reputation rating flagged for down-ranking on future matching cycles."
      );
      onStatusUpdate({ ...booking });
    }
  }
}
