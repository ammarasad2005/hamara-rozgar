import { mockProviders, sectorsCoordinates } from "../data/mockProviders";
import { collection, addDoc } from "firebase/firestore";

// Core Agent Orchestrator class in the style of Google Antigravity
export class ServiceOrchestrator {
  constructor(onTraceUpdate, onStateChange, firestoreDb = null) {
    this.onTraceUpdate = onTraceUpdate; // callback to push logs to UI
    this.onStateChange = onStateChange; // callback for database state updates
    this.firestoreDb = firestoreDb; // Option to bind active Firestore instance
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

  // Multilingual Intent Understanding Agent (Local + Gemini Hybrid)
  async parseIntent(rawInput, geminiApiKey = "", chatHistory = [], previousIntent = null) {
    this.logAgentTrace("IntentAgent", "Parsing User Request", `Input: "${rawInput}"`, "Understanding natural language request across Urdu, Roman Urdu, and English.");
    
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

    // Check if Gemini API key is provided for live parsing
    if (geminiApiKey) {
      this.logAgentTrace(
        "IntentAgent",
        "Live Gemini API Parsing Triggered",
        "Sending query to Google AI Studio Gemini model for perfect semantic parsing.",
        "Using structured response format to extract service, location, and urgency.",
        "Gemini 1.5 Flash"
      );

      try {
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
- If no location can be found in the entire conversation history, default to "G-13".

Rules for Urgency/Time mapping:
- If the user says "urgent", "abbi", "fauri", "right now", "fauran", or similar -> severity should be "high", time should be "Immediately".
- Otherwise, map to "Tomorrow Morning (10:00 AM)", "Evening (05:00 PM)", or whatever they requested.

Rules for Price Sensitivity:
- If the user says "budget", "sasta", "cheap", "kam price", "zyada nahi", "سستا", or similar -> priceSensitivity should be "high".
- Otherwise, priceSensitivity should be "medium".

Provide ONLY the raw JSON output. No markdown wrappers, no backticks, just valid JSON.`;

        // Format chatHistory into Gemini API contents structure
        const contents = [];
        if (chatHistory && chatHistory.length > 0) {
          chatHistory.forEach(msg => {
            if (msg.sender === "user") {
              contents.push({
                role: "user",
                parts: [{ text: msg.text }]
              });
            } else if (msg.sender === "bot") {
              // Extract text cleanly, omitting markdown indicators
              contents.push({
                role: "model",
                parts: [{ text: msg.text.replace(/\*\*/g, "") }]
              });
            }
          });
        }

        // Add the current user input as the active turn
        contents.push({
          role: "user",
          parts: [{ text: rawInput }]
        });

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": geminiApiKey
          },
          body: JSON.stringify({
            contents: contents,
            system_instruction: {
              parts: [
                { text: systemPrompt }
              ]
            },
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        });

        if (!response.ok) {
          let errMsg = `HTTP ${response.status}: ${response.statusText}`;
          try {
            const errData = await response.json();
            if (errData.error?.message) {
              errMsg = `${errMsg} - ${errData.error.message}`;
            }
          } catch (_) {}
          throw new Error(errMsg);
        }

        const responseData = await response.json();
        const responseText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!responseText) {
          throw new Error("Empty response from Gemini API");
        }

        const parsedIntent = JSON.parse(responseText.trim());
        
        // Sanity validation of parsed fields to ensure robust integration
        const validServices = ["AC Technician", "Electrician", "Plumber", "Tutor", "Beautician", "Mechanic"];
        
        if (!validServices.includes(parsedIntent.service)) {
          parsedIntent.service = previousIntent?.service || "AC Technician"; // carry over previous or default
        }
        
        // Allow custom address strings to proceed for dynamic Geocoding!
        if (!parsedIntent.location) {
          parsedIntent.location = previousIntent?.location || "G-13";
        }
        
        parsedIntent.confidence = parsedIntent.confidence || 0.95;
        parsedIntent.severity = parsedIntent.severity || previousIntent?.severity || "medium";
        parsedIntent.priceSensitivity = parsedIntent.priceSensitivity || previousIntent?.priceSensitivity || "medium";

        this.logAgentTrace(
          "IntentAgent",
          "Gemini Intent Parsed Successfully",
          JSON.stringify(parsedIntent),
          `Confidence: ${parsedIntent.confidence * 100}%. Rich semantic matching executed successfully via Cloud Gemini LLM.`,
          "Gemini LLM Parser"
        );

        this.updateTaskStatus(0, "completed");
        return parsedIntent;

      } catch (err) {
        this.logAgentTrace(
          "IntentAgent",
          "Gemini Parsing Failed",
          err.message,
          "Gracefully falling back to local regex-based dictionary parsing to maintain zero interruption.",
          "Error Recovery Module"
        );
      }
    }

    // Local Regex / Slang parsing (offline fallback & ultra-fast matching)
    let service = previousIntent?.service || "AC Technician"; // carry over previous or default
    let location = previousIntent?.location || "G-13"; // carry over previous or default
    let time = previousIntent?.time || "Tomorrow morning";
    let severity = previousIntent?.severity || "medium";
    let priceSensitivity = previousIntent?.priceSensitivity || "medium";
    let confidence = 0.85;

    const lowerInput = rawInput.toLowerCase();

    // 1. Service detection (Expanded triggers for plumbing, electrical, mechanical, tutoring, etc.)
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
      confidence = 0.5; // low confidence if no clear category found
    } else {
      // High confidence since it's a refinement turn carrying over previous service context
      confidence = 0.90;
    }

    // 2. Location detection (Sector matching & custom Roman Urdu location extraction)
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
      // Check for common Urdu/Roman Urdu address patterns (e.g. "main sector 4 airport society mein rehta hu")
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

    // 3. Urgency & Time detection
    if (lowerInput.includes("urgent") || lowerInput.includes("abbi") || lowerInput.includes("fauri") || lowerInput.includes("right now") || lowerInput.includes("فوری")) {
      time = "Immediately";
      severity = "high";
    } else if (lowerInput.includes("kal subah") || lowerInput.includes("tomorrow morning") || lowerInput.includes("کل صبح")) {
      time = "Tomorrow Morning (10:00 AM)";
    } else if (lowerInput.includes("sham") || lowerInput.includes("evening") || lowerInput.includes("شام")) {
      time = "Evening (05:00 PM)";
    }

    // 4. Budget / Price sensitivity
    if (lowerInput.includes("budget") || lowerInput.includes("sasta") || lowerInput.includes("cheap") || lowerInput.includes("zyada nahi") || lowerInput.includes("سستا")) {
      priceSensitivity = "high";
    }

    const resultIntent = { service, location, time, severity, priceSensitivity, confidence };

    this.logAgentTrace(
      "IntentAgent",
      "Intent Extracted",
      JSON.stringify(resultIntent),
      `Confidence: ${confidence * 100}%. Successfully mapped language structures to operational categories.`,
      "NLP Parser"
    );

    this.updateTaskStatus(0, "completed");
    return resultIntent;
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

  // Google Places API (New) Live Search
  async fetchLiveProvidersFromPlaces(service, locationName, apiKey) {
    this.logAgentTrace(
      "DiscoveryAgent", 
      "Live Places API Query Triggered", 
      `Querying Google Places (New) for "${service} in ${locationName}, Islamabad"`, 
      "Making an authorized POST request to search for physical businesses and fetch their real ratings/reviews.", 
      "Google Places SDK"
    );

    try {
      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.primaryType"
        },
        body: JSON.stringify({
          textQuery: `${service} in ${locationName}, Islamabad`
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.places || data.places.length === 0) {
        this.logAgentTrace("DiscoveryAgent", "Live Places API Response Empty", "No physical businesses matched query. Falling back to local high-fidelity registry.");
        return null;
      }

      // Map Places API results to our provider structure
      return data.places.map((place, idx) => {
        const name = place.displayName?.text || `Live Provider #${idx + 1}`;
        const rating = place.rating || parseFloat((4.0 + Math.random() * 0.9).toFixed(1));
        const reviewCount = place.userRatingCount || Math.floor(5 + Math.random() * 45);
        const lat = place.location?.latitude || 33.6409;
        const lng = place.location?.longitude || 72.9814;

        return {
          id: `live-p-${idx}-${Date.now()}`,
          name,
          specialization: service,
          baseRate: service === "AC Technician" ? 1500 : service === "Plumber" ? 1000 : 1200, // standard base rate
          rating,
          reliabilityScore: Math.floor(92 + Math.random() * 8), // simulated reliability
          cancellationRate: Math.floor(Math.random() * 4), // simulated cancellation rate
          availability: ["10:00 AM", "12:00 PM", "03:00 PM", "05:00 PM"],
          location: locationName,
          latitude: lat,
          longitude: lng,
          phone: `+92 300 ${Math.floor(1000000 + Math.random() * 9000000)}`,
          experienceYears: Math.floor(6 + Math.random() * 8),
          toolsProvided: true,
          certifications: ["Google Places verified business"],
          reviews: [
            { user: "Live Reviewer", rating: Math.round(rating), comment: `Verified local Google review. Out of ${reviewCount} total reviews.`, date: "2026-05-20" }
          ]
        };
      });
    } catch (err) {
      this.logAgentTrace("DiscoveryAgent", "Live Places API Request Failed", err.message, "Defaulting to fallback provider database.");
      return null;
    }
  }

  // Live Geocoding API to resolve custom addresses/sectors into coordinates
  async getCoordinates(locationName, apiKey) {
    this.logAgentTrace(
      "DiscoveryAgent",
      "Geocoding Custom Location",
      `Querying Google Geocoding API for "${locationName}, Islamabad, Pakistan"`,
      "Converting custom address / sector string to high-precision latitude & longitude coordinate points.",
      "Google Geocoding API"
    );
    try {
      const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(locationName + ", Islamabad, Pakistan")}&key=${apiKey}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      if (data.status === "OK" && data.results && data.results.length > 0) {
        const location = data.results[0].geometry.location;
        const coords = { latitude: location.lat, longitude: location.lng };
        this.logAgentTrace(
          "DiscoveryAgent",
          "Geocoding Succeeded",
          `Coordinates: ${coords.latitude}, ${coords.longitude} for "${locationName}"`,
          "Successfully parsed dynamic coordinates.",
          "Geocoding API"
        );
        return coords;
      } else {
        throw new Error(`Geocoding status: ${data.status}`);
      }
    } catch (err) {
      this.logAgentTrace(
        "DiscoveryAgent",
        "Geocoding Failed",
        err.message,
        "Using default fallback sector coordinate system.",
        "Geocoding Fallback"
      );
      return null;
    }
  }

  // Multi-factor Matching and Ranking Agent
  async discoverAndRank(intent, gcpMapsKey = "", activeCoords = null) {
    this.updateTaskStatus(1, "in-progress");
    this.logAgentTrace(
      "DiscoveryAgent",
      "Scanning Provider Registry",
      `Specialization: "${intent.service}", Target Sector: "${intent.location}"`,
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

    if (!targetCoords && gcpMapsKey) {
      targetCoords = await this.getCoordinates(intent.location, gcpMapsKey);
    }
    if (!targetCoords) {
      targetCoords = sectorsCoordinates["G-13"]; // ultimate fallback
    }

    let matches = [];

    // If live API key is provided, attempt to fetch live local businesses from Places API
    if (gcpMapsKey) {
      const liveProviders = await this.fetchLiveProvidersFromPlaces(intent.service, intent.location, gcpMapsKey);
      if (liveProviders && liveProviders.length > 0) {
        matches = liveProviders;
        this.logAgentTrace(
          "DiscoveryAgent",
          "Live Providers Loaded",
          `Fetched ${liveProviders.length} active physical businesses from Google Places API.`,
          "Now executing 6-factor multi-attribute utility calculation on live dataset."
        );
      }
    }

    // Fallback to local mock database if no key or API failed
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

  // Booking Simulation Agent
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

    // If live Firestore is available, save booking records to Firestore
    if (this.firestoreDb) {
      try {
        const docRef = await addDoc(collection(this.firestoreDb, "bookings"), newBooking);
        this.logAgentTrace("BookingAgent", "Firestore Write Succeeded", `Doc ID: ${docRef.id}`, "Successfully committed transaction record to persistent storage.", "Firestore SDK");
      } catch (err) {
        this.logAgentTrace("BookingAgent", "Firestore Write Failed", err.message, "Falling back to reactive local database cache.", "Firestore SDK");
      }
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

    // Step 1: En-Route (simulated after 3 seconds)
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

    // Step 2: Work Started (simulated after 8 seconds)
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

    // Step 3: Work Completed (simulated after 14 seconds)
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
  async handleDispute(booking, type, details, onStatusUpdate, gcpMapsKey = "", gpsCoords = null) {
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
      }, gcpMapsKey, gpsCoords);

      const alternative = nextCandidates.find(p => p.id !== booking.providerId);
      if (alternative) {
        booking.providerId = alternative.id;
        booking.providerName = alternative.name;
        booking.providerPhone = alternative.phone;
        booking.status = "Re-assigned to " + alternative.name;
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
