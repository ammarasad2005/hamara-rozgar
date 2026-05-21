import React, { useState, useEffect, useRef } from "react";
import { ServiceOrchestrator } from "./agents/Orchestrator";
import { sampleRequests } from "./data/mockProviders";
import { 
  Bot, User, Sparkles, Navigation, Calendar, 
  MapPin, CheckCircle, AlertTriangle, Settings, 
  Briefcase, DollarSign, Star, Send, ShieldCheck,
  ChevronDown, ChevronUp, Terminal, History, Check, ShieldAlert,
  Phone, X, Compass, RefreshCw, HelpCircle
} from "lucide-react";

// 🔐 Configuration Settings & Credentials loaded from environment variables
const nlpEngine = import.meta.env.VITE_NLP_ENGINE || "regex";
const mapEngine = import.meta.env.VITE_MAP_ENGINE || "osm";
const ollamaUrl = import.meta.env.VITE_OLLAMA_URL || "http://localhost:11434";
const ollamaModel = import.meta.env.VITE_OLLAMA_MODEL || "llama3";
const groqApiKey = import.meta.env.VITE_GROQ_API_KEY || "";
const githubToken = import.meta.env.VITE_GITHUB_TOKEN || "";
const githubModel = import.meta.env.VITE_GITHUB_MODEL || "gpt-4o";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export default function App() {
  const [orchestrator, setOrchestrator] = useState(null);
  
  // 🧭 Navigation state machine
  const [currentView, setCurrentView] = useState("home"); // "home" | "matching" | "active-booking" | "history"
  const [isMatchingComplete, setIsMatchingComplete] = useState(false);
  const [showDeveloperTrace, setShowDeveloperTrace] = useState(false);
  
  // 🛠️ Logging and tracking states
  const [traceLogs, setTraceLogs] = useState([]);
  const [workplan, setWorkplan] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [pastBookings, setPastBookings] = useState([]);
  
  // 💬 Slang Prompt Input states
  const [userInput, setUserInput] = useState("");
  const [activeCategory, setActiveCategory] = useState(null); // plumbing, ac, electrical, cleaning, painting
  
  // 📍 Live Proximity Location Hub States
  const [gpsCoords, setGpsCoords] = useState(null); 
  const [customCoords, setCustomCoords] = useState(null);
  const [locationMode, setLocationMode] = useState("GPS"); 
  const [customLocationName, setCustomLocationName] = useState(""); 
  const [resolvedLocationName, setResolvedLocationName] = useState("Defaulting GPS...");
  const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false);

  // 👤 Specialist / Booking states
  const [activeIntent, setActiveIntent] = useState(null);
  const [matchedProviders, setMatchedProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [priceQuote, setPriceQuote] = useState(null);
  const [activeBooking, setActiveBooking] = useState(null);
  const [trackingStatus, setTrackingStatus] = useState(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  // 📡 Supabase dynamic validation
  const [supabaseConnected, setSupabaseConnected] = useState(false);

  // Accordion timeline drawers
  const [openTimelineAccordions, setOpenTimelineAccordions] = useState({
    0: false, 1: false, 2: false, 3: false, 4: false, 5: false
  });

  const chatEndRef = useRef(null);
  const traceEndRef = useRef(null);
  const terminalEndRef = useRef(null);

  // Load bookings list
  const loadBookings = async (agentInstance = null) => {
    const activeAgent = agentInstance || orchestrator;
    if (!activeAgent) return;
    
    if (supabaseUrl && supabaseKey && supabaseConnected) {
      try {
        const bookings = await activeAgent.fetchBookingsFromSupabase({ supabaseUrl, supabaseKey });
        setPastBookings(bookings);
      } catch (err) {
        console.error("Failed to fetch from Supabase. Falling back to local storage.", err);
        const local = JSON.parse(localStorage.getItem("hamara_rozgar_bookings") || "[]");
        setPastBookings(local);
      }
    } else {
      const local = JSON.parse(localStorage.getItem("hamara_rozgar_bookings") || "[]");
      setPastBookings(local);
    }
  };

  useEffect(() => {
    // Initialize Orchestrator agent
    const agent = new ServiceOrchestrator(
      (logs) => setTraceLogs(logs),
      (state) => {
        if (state.workplan) setWorkplan(state.workplan);
        if (state.tasks) setTasks(state.tasks);
      }
    );
    setOrchestrator(agent);

    // Fetch browser location at startup
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          setGpsCoords(coords);
          setResolvedLocationName("Live GPS Locked");
          agent.logAgentTrace(
            "System",
            "GPS Location Locked",
            `Latitude: ${coords.latitude}, Longitude: ${coords.longitude}`,
            "Successfully fetched browser Geolocation at startup to use as default proximity center."
          );
        },
        (error) => {
          agent.logAgentTrace(
            "System",
            "GPS Location Request Failed",
            "Using default coordinates for G-13",
            "Proximity center defaulted. Custom address updates can still be entered."
          );
          setResolvedLocationName("G-13, Islamabad (Fallback)");
        }
      );
    }

    // Initial load of bookings
    setTimeout(() => {
      loadBookings(agent);
    }, 800);
  }, []);

  // Securely verify Supabase Connection on Mount
  useEffect(() => {
    if (supabaseUrl && supabaseKey) {
      const cleanUrl = supabaseUrl.replace(/\/$/, "");
      fetch(`${cleanUrl}/rest/v1/bookings?limit=1`, {
        method: "GET",
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`
        }
      })
      .then(res => {
        if (res.ok) {
          setSupabaseConnected(true);
        } else {
          setSupabaseConnected(false);
        }
      })
      .catch(() => {
        setSupabaseConnected(false);
      });
    } else {
      setSupabaseConnected(false);
    }
  }, [supabaseUrl, supabaseKey]);

  // Reload past ledger when connection is resolved
  useEffect(() => {
    loadBookings();
  }, [supabaseConnected]);

  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [traceLogs]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [traceLogs]);

  // Proximity Hub Controllers
  const triggerGpsFetch = (customAgent = null) => {
    const activeAgent = customAgent || orchestrator;
    if (navigator.geolocation) {
      if (activeAgent) {
        activeAgent.logAgentTrace("System", "Re-fetching GPS Location", "Querying browser Geolocation API...", "Active coordinates sync initialized.");
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          setGpsCoords(coords);
          setResolvedLocationName("Live GPS Locked");
        },
        (error) => {
          if (activeAgent) {
            activeAgent.logAgentTrace("System", "GPS Location Access Blocked", error.message, "Using G-13 coordinates as absolute default fallback.");
          }
        }
      );
    }
  };

  const handleToggleLocationMode = (mode) => {
    setLocationMode(mode);
    if (orchestrator) {
      orchestrator.logAgentTrace(
        "System",
        "Location Mode Switched",
        `Mode: ${mode}`,
        mode === "GPS" 
          ? "Switching to browser live coordinate lock system."
          : "Enabling manual custom input. Enter any sector, landmark, or address."
      );
    }
    if (mode === "GPS" && !gpsCoords) {
      triggerGpsFetch();
    }
  };

  const handleResolveCustomLocation = async () => {
    if (!customLocationName.trim() || !orchestrator) return;
    
    orchestrator.logAgentTrace(
      "System",
      "Dynamic Geocoding Requested",
      `Address query: "${customLocationName}"`,
      "Invoking OpenStreetMap Nominatim Geocoding service to convert string to coordinates."
    );

    const coords = await orchestrator.getCoordinates(customLocationName, { mode: mapEngine });
    if (coords) {
      setCustomCoords(coords);
      setResolvedLocationName(customLocationName);
      orchestrator.logAgentTrace(
        "System",
        "Dynamic Geocoding Resolved",
        `OSM Coordinates: ${coords.latitude}, ${coords.longitude}`,
        "Successfully mapped dynamic address override to coordinates."
      );
      setIsLocationMenuOpen(false);
    } else {
      // Local fallback coordinates
      setCustomCoords({ latitude: 33.6409, longitude: 72.9814 });
      setResolvedLocationName(`${customLocationName} (Local fallback)`);
      orchestrator.logAgentTrace(
        "System",
        "Dynamic Geocoding Fallback Lock",
        "Using default center: Lat: 33.6409, Lng: 72.9814",
        "No live OSM result or search failed. Using G-13 coordinate baseline."
      );
      setIsLocationMenuOpen(false);
    }
  };

  // Process customer prompt booking request
  const handleRequestSubmit = async (text) => {
    if (!text.trim() || !orchestrator) return;

    // Transition to Matching view immediately
    setCurrentView("matching");
    setIsMatchingComplete(false);
    
    // Clear old details
    setActiveIntent(null);
    setMatchedProviders([]);
    setSelectedProvider(null);
    setPriceQuote(null);
    setActiveBooking(null);
    setTrackingStatus(null);

    const previousIntent = activeIntent;

    // 1. Stage 0: Parse Conversational Slang
    const parsedIntent = await orchestrator.parseIntent(
      text, 
      { 
        mode: nlpEngine, 
        ollamaUrl, 
        ollamaModel, 
        groqKey: groqApiKey, 
        githubToken, 
        githubModel 
      }, 
      [], // fresh prompt
      previousIntent
    );
    
    setActiveIntent(parsedIntent);
    
    // Aesthetic processing delay for AI feeling
    await new Promise(r => setTimeout(r, 600));

    // 2. Stage 1: Proximity Geocoding
    let activeCoords = null;
    const isCustomTextLocation = parsedIntent.location && 
                                 parsedIntent.location !== "G-13" && 
                                 parsedIntent.location !== "GPS Location";

    if (isCustomTextLocation) {
      setLocationMode("Custom");
      setCustomLocationName(parsedIntent.location);
      const resolved = await orchestrator.getCoordinates(parsedIntent.location, { mode: mapEngine });
      if (resolved) {
        setCustomCoords(resolved);
        activeCoords = resolved;
      } else {
        const fallbackCoords = { latitude: 33.6409, longitude: 72.9814 };
        setCustomCoords(fallbackCoords);
        activeCoords = fallbackCoords;
      }
    } else {
      if (locationMode === "Custom" && customLocationName.trim()) {
        parsedIntent.location = customLocationName.trim();
        if (customCoords) {
          activeCoords = customCoords;
        } else {
          const resolved = await orchestrator.getCoordinates(customLocationName, { mode: mapEngine });
          if (resolved) {
            setCustomCoords(resolved);
            activeCoords = resolved;
          } else {
            const fallbackCoords = { latitude: 33.6409, longitude: 72.9814 };
            setCustomCoords(fallbackCoords);
            activeCoords = fallbackCoords;
          }
        }
      } else {
        parsedIntent.location = "GPS Location";
        activeCoords = gpsCoords || { latitude: 33.6409, longitude: 72.9814 };
      }
    }

    await new Promise(r => setTimeout(r, 600));

    // 3. Stage 2: Registry Discovery & scoring 
    const providers = await orchestrator.discoverAndRank(parsedIntent, { mode: mapEngine }, activeCoords);
    setMatchedProviders(providers);

    if (providers.length === 0) {
      setIsMatchingComplete(true);
      return;
    }

    await new Promise(r => setTimeout(r, 600));

    const topProvider = providers[0];
    setSelectedProvider(topProvider);

    // 4. Stage 3: Dynamic Pricing Quote
    const quote = orchestrator.calculatePricing(topProvider, parsedIntent);
    setPriceQuote(quote);

    await new Promise(r => setTimeout(r, 600));

    // Discover matching complete
    setIsMatchingComplete(true);
  };

  // Confirm booking write to Supabase / Local storage
  const handleConfirmBooking = async () => {
    if (!orchestrator || !selectedProvider || !priceQuote || !activeIntent) return;

    // Immediately advance to dispatched view
    setCurrentView("active-booking");
    setTrackingStatus("Committed to Ledger");

    const activeCoords = locationMode === "GPS" ? gpsCoords : customCoords;
    
    // Commit transaction to database
    const booking = await orchestrator.simulateBooking(
      selectedProvider, 
      priceQuote, 
      activeIntent, 
      activeCoords,
      { supabaseUrl, supabaseKey }
    );
    
    setActiveBooking(booking);
    setTrackingStatus(booking.status);
    loadBookings(); // sync receipt list

    // Trigger en-route stepper simulation
    orchestrator.simulateServiceProgress(
      booking, 
      (updatedBooking) => {
        setTrackingStatus(updatedBooking.status);
        loadBookings(); // update past list
      },
      { supabaseUrl, supabaseKey }
    );
  };

  // Dispute Agent execution triggers
  const triggerDisputeScenario = async (type) => {
    if (!orchestrator || !activeBooking) return;
    
    const activeCoords = locationMode === "GPS" ? gpsCoords : customCoords;
    
    await orchestrator.handleDispute(
      activeBooking, 
      type, 
      `Customer reported anomaly: ${type}`, 
      (updatedBooking) => {
        setTrackingStatus(updatedBooking.status);
        loadBookings(); 
        
        if (type === "Provider Cancelled") {
          setSelectedProvider(updatedBooking);
        }
      }, 
      { mode: mapEngine }, 
      activeCoords,
      { supabaseUrl, supabaseKey }
    );
  };

  const toggleAccordion = (index) => {
    setOpenTimelineAccordions(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const getStageTraces = (stageIndex) => {
    switch (stageIndex) {
      case 0:
        return traceLogs.filter(log => log.agent === "IntentAgent" || (log.agent === "System" && log.action.includes("NLP")));
      case 1:
        return traceLogs.filter(log => log.agent === "DiscoveryAgent" && (log.action.includes("Geocoding") || log.action.includes("Nominatim")));
      case 2:
        return traceLogs.filter(log => log.agent === "DiscoveryAgent" && !log.action.includes("Geocoding") && !log.action.includes("Nominatim"));
      case 3:
        return traceLogs.filter(log => log.agent === "PricingAgent");
      case 4:
        return traceLogs.filter(log => log.agent === "BookingAgent");
      case 5:
        return traceLogs.filter(log => log.agent === "FollowupAgent" || log.agent === "DisputeAgent");
      default:
        return [];
    }
  };

  const handleQuickAction = (categoryKey, defaultText) => {
    setActiveCategory(categoryKey);
    setUserInput(defaultText);
  };

  const handleCompleteJob = () => {
    setShowFeedbackModal(true);
  };

  const closeFeedbackAndReset = () => {
    setShowFeedbackModal(false);
    setCurrentView("home");
    setUserInput("");
    setActiveCategory(null);
    setActiveBooking(null);
  };

  return (
    <div className="consumer-portal-container">
      {/* 🚀 Top Brand Navigation Bar */}
      <header className="consumer-nav">
        <div className="brand-group">
          <Sparkles size={24} className="brand-glow-icon" />
          <div>
            <h1 className="brand-name">Hamara Rozgar</h1>
            <p className="brand-tagline">AI-Powered Proximity Service Orchestrator</p>
          </div>
        </div>

        <div className="nav-actions">
          {currentView !== "history" ? (
            <button className="nav-btn-history" onClick={() => setCurrentView("history")}>
              <History size={16} />
              <span>My Bookings</span>
            </button>
          ) : (
            <button className="nav-btn-history" onClick={() => setCurrentView("home")}>
              <Compass size={16} />
              <span>Back Home</span>
            </button>
          )}

          {/* Sync Connection Badge */}
          <span className={`sync-badge ${supabaseConnected ? "synced" : "local"}`} title={supabaseConnected ? "Supabase Cloud persistence online" : "Using browser LocalStorage backup"}>
            <span className="sync-badge-dot"></span>
            {supabaseConnected ? "Supabase Sync" : "Local Ledger"}
          </span>
        </div>
      </header>

      {/* 📍 Proximity Location Hub Selector */}
      <section className="location-bar">
        <div className="location-info-trigger" onClick={() => setIsLocationMenuOpen(!isLocationMenuOpen)}>
          <MapPin size={18} className="location-marker-icon" />
          <div className="location-info-text">
            <span className="location-label-title">
              {locationMode === "GPS" ? "Direct GPS Proximity Lock" : "Custom Society Landmark"}
            </span>
            <span className="location-label-value">{resolvedLocationName}</span>
          </div>
          <Settings size={14} className={`location-cog-icon ${isLocationMenuOpen ? "rotate" : ""}`} />
        </div>

        {/* Floating Modal for Location Picker */}
        {isLocationMenuOpen && (
          <div className="location-overlay-modal">
            <div className="location-modal-header">
              <h3>Configure Service Location</h3>
              <button className="close-modal-btn" onClick={() => setIsLocationMenuOpen(false)}>
                <X size={16} />
              </button>
            </div>
            
            <div className="location-modal-tabs">
              <button 
                className={`loc-tab ${locationMode === "GPS" ? "active" : ""}`}
                onClick={() => handleToggleLocationMode("GPS")}
              >
                Use GPS Coordinates
              </button>
              <button 
                className={`loc-tab ${locationMode === "Custom" ? "active" : ""}`}
                onClick={() => handleToggleLocationMode("Custom")}
              >
                Custom Address Geocode
              </button>
            </div>

            <div className="location-modal-body">
              {locationMode === "GPS" ? (
                <div className="gps-modal-content">
                  {gpsCoords ? (
                    <div className="coords-display">
                      <div className="coords-line"><span>Latitude:</span> <span>{gpsCoords.latitude.toFixed(6)}</span></div>
                      <div className="coords-line"><span>Longitude:</span> <span>{gpsCoords.longitude.toFixed(6)}</span></div>
                      <div className="gps-status-ok">✔ direct GPS satellite lock active</div>
                    </div>
                  ) : (
                    <div className="gps-modal-fetch">
                      <p>Pending live browser location permission...</p>
                      <button className="modal-action-btn" onClick={() => triggerGpsFetch()}>
                        Request GPS Satellite Access
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="custom-modal-content">
                  <p className="modal-helper-text">Enter any sector, colony, or society name. OpenStreetMap Nominatim will geocode coordinates dynamically.</p>
                  <div className="custom-input-box">
                    <input 
                      type="text" 
                      placeholder="E.g. Sector G-11, Islamabad" 
                      value={customLocationName}
                      onChange={(e) => setCustomLocationName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleResolveCustomLocation()}
                    />
                    <button className="modal-action-btn" onClick={handleResolveCustomLocation}>
                      Resolve
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 🚀 MAIN CUSTOMER VIEW STATE CONTROLLER */}
      <main className="consumer-canvas">
        
        {/* VIEW 1: HOME PORTAL (REQUEST SERVICES) */}
        {currentView === "home" && (
          <div className="view-fade-in">
            {/* Consumer Hero Greeting */}
            <div className="consumer-hero">
              <h2>Aapko kya khidmat chahiye?</h2>
              <p>Type in Urdu, Roman Urdu, or English. Our AI Multi-Agent system will immediately parse your intent, geocode coordinates, and dispatch a vetted professional near you.</p>
            </div>

            {/* Quick Action Category Cards */}
            <div className="categories-grid">
              {[
                { key: "ac", label: "AC & Cooling Repair", icon: Sparkles, desc: "Sajid AC Repairs & candidates", suggestion: "yaar AC bilkul thanda nhi kar rha G-13 me" },
                { key: "plumbing", label: "Plumbing & Leaks", icon: Briefcase, desc: "Tariq Plumbers & specialists", suggestion: "kitchen me paani beh rha hai urgent G-11 me" },
                { key: "electrical", label: "Electrician Services", icon: DollarSign, desc: "Amjad Electricians & registry", suggestion: "short circuit ho gya hai socket me urgent G-13 me" },
                { key: "cleaning", label: "Home Deep Cleaning", icon: Star, desc: "Direct registry cleaning partners", suggestion: "ghar ki safai krwani hai urgent" },
                { key: "painting", label: "Professional Painting", icon: Calendar, desc: "Home paint and touch-ups", suggestion: "kamre ka rang kharab hai paint krwana hai" }
              ].map((cat) => (
                <button 
                  key={cat.key} 
                  className={`category-card ${activeCategory === cat.key ? "selected" : ""}`}
                  onClick={() => handleQuickAction(cat.key, cat.suggestion)}
                >
                  <div className="cat-icon-container">
                    <cat.icon size={22} />
                  </div>
                  <div className="cat-details">
                    <h3>{cat.label}</h3>
                    <p>{cat.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Prompt Search Panel */}
            <div className="prompt-dispatch-card">
              <div className="prompt-header-row">
                <span className="bilingual-badge">Urdu / Roman Urdu / English</span>
                <span className="prompt-label">Explain your request:</span>
              </div>
              
              <div className="prompt-input-wrapper">
                <textarea 
                  className="prompt-textarea"
                  placeholder="E.g., 'yaar AC thanda nahi kar raha urgent Islamabad sector G-13 me' or 'Plumber urgent kitchen leakage G-11'..."
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleRequestSubmit(userInput))}
                />
                <button 
                  className="dispatch-glow-btn"
                  onClick={() => handleRequestSubmit(userInput)}
                  disabled={!userInput.trim()}
                >
                  <Send size={18} />
                  <span>Find Specialist</span>
                </button>
              </div>

              {/* Slang suggestion list below */}
              <div className="slang-tips-bar">
                <span className="tips-label">Suggestions:</span>
                <div className="chips-scroller">
                  {sampleRequests.map((req, idx) => (
                    <button 
                      key={idx} 
                      className="slang-chip"
                      onClick={() => handleQuickAction(null, req.text)}
                    >
                      💬 "{req.text.length > 40 ? req.text.substring(0, 40) + "..." : req.text}"
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: ACTIVE MATCHING ORBIT SPINNER & CHRONOLOGICAL TIMELINE */}
        {currentView === "matching" && (
          <div className="view-fade-in matching-viewport">
            
            {/* Spinning Radar Overlay */}
            {!isMatchingComplete ? (
              <div className="matching-radar-container">
                <div className="matching-radar-pulse"></div>
                <div className="radar-circle">
                  <RefreshCw size={36} className="radar-icon-spin" />
                </div>
                <h2>AI Orchestrator Matching...</h2>
                <p>Orchestrating AI agents, geocoding landmarks, and scanning candidate workloads.</p>
              </div>
            ) : (
              <div className="matching-result-card-container">
                {selectedProvider ? (
                  <div className="matched-result-card card-glow-purple">
                    <div className="matched-result-header">
                      <span className="highlight-tag">Best Match Found</span>
                      <h3>Specialist Reserved for You!</h3>
                    </div>

                    <div className="provider-match-profile">
                      <div className="provider-match-avatar">
                        <User size={32} />
                      </div>
                      <div className="provider-match-info">
                        <h4>{selectedProvider.name}</h4>
                        <span className="provider-match-rating">★ {selectedProvider.rating} rating</span>
                        <div className="provider-match-metrics">
                          <span>📍 {selectedProvider.calculatedDistance} km away ({selectedProvider.location})</span>
                          <span>⏱️ {selectedProvider.reliabilityScore}% reliability score</span>
                        </div>
                      </div>
                    </div>

                    {/* Cost Summary Box */}
                    {priceQuote && (
                      <div className="pricing-match-box">
                        <div className="price-row">
                          <span>Fair Fare Pricing:</span>
                          <span className="price-value">{priceQuote.totalPrice} PKR</span>
                        </div>
                        <div className="price-breakdown-mini">
                          Base rate: {priceQuote.basePrice} PKR | Travel: {priceQuote.travelFee} PKR {priceQuote.surgePrice > 0 && `| Surge: +${priceQuote.surgePrice} PKR`} {priceQuote.loyaltyDiscount > 0 && `| Loyalty: -${priceQuote.loyaltyDiscount} PKR`}
                        </div>
                      </div>
                    )}

                    <div className="match-actions-row">
                      <button className="confirm-dispatch-btn" onClick={handleConfirmBooking}>
                        <Check size={18} />
                        <span>Confirm & Dispatch Provider</span>
                      </button>
                      <button className="cancel-match-btn" onClick={() => setCurrentView("home")}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="matched-failed-card">
                    <AlertTriangle size={32} color="#ef4444" />
                    <h3>No Nearby Specialist Found</h3>
                    <p>Sorry, we could not find any active provider matches in your proximity center. Try searching a different society landmark or override the location.</p>
                    <button className="modal-action-btn" onClick={() => setCurrentView("home")}>
                      Modify Search
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 6-Stage Agentic Timeline Tree */}
            <div className="timeline-section-card">
              <h3 className="section-title">
                <Sparkles size={16} color="var(--accent-purple)" />
                Agentic Orchestration Timeline
              </h3>
              
              <div className="timeline-container">
                {[
                  { title: "Intent Parsing & Conversational Semantics", index: 0, desc: "Understanding bilingual Urdu slang triggers" },
                  { title: "Proximity Location Geocoding", index: 1, desc: "OpenStreetMap Nominatim address coordinate mapping" },
                  { title: "Registry Scan & Workload Balancing", index: 2, desc: "6-factor algorithm candidate utility computation" },
                  { title: "Dynamic Quote Pricing Engine", index: 3, desc: "Formulating transparent quote & applying loyalty benefits" },
                  { title: "Secure Persistent Ledger Transaction", index: 4, desc: "Recording secure transaction parameters to database" },
                  { title: "Real-time Tracking & Dispute Escalations", index: 5, desc: "Dispatched tracking and automated anomaly audits" }
                ].map((stage) => {
                  const stageStatus = tasks[stage.index]?.status || "pending";
                  const stageTraces = getStageTraces(stage.index);
                  const isOpen = openTimelineAccordions[stage.index];
                  
                  return (
                    <div 
                      key={stage.index} 
                      className={`timeline-node ${
                        stageStatus === "in-progress" ? "active-stage" : 
                        stageStatus === "completed" ? "completed-stage" : ""
                      }`}
                    >
                      <div className="timeline-icon-wrapper">
                        <span className={`timeline-dot ${stageStatus}`}></span>
                      </div>

                      <div className="timeline-node-header" onClick={() => toggleAccordion(stage.index)}>
                        <div className="timeline-node-title">
                          <span className={stageStatus === "completed" ? "completed" : ""}>
                            {stage.title}
                          </span>
                        </div>
                        
                        <span className={`timeline-badge-status ${stageStatus}`}>
                          {stageStatus}
                        </span>
                        
                        {stageTraces.length > 0 ? (
                          isOpen ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />
                        ) : null}
                      </div>

                      <div className="timeline-node-subdesc">{stage.desc}</div>

                      {/* Display dynamically fetched results inline for the customer to see! */}
                      {stageStatus === "completed" && stage.index === 0 && activeIntent && (
                        <div className="timeline-extracted-inline">
                          🔍 Detected Category: <strong>{activeIntent.service}</strong> {activeIntent.urgency && <span className="urgency-pill">Urgent</span>}
                        </div>
                      )}

                      {stageStatus === "completed" && stage.index === 1 && activeIntent && (
                        <div className="timeline-extracted-inline">
                          📍 Located Sector: <strong>{activeIntent.location}</strong>
                        </div>
                      )}

                      {stageStatus === "completed" && stage.index === 2 && selectedProvider && (
                        <div className="timeline-extracted-inline">
                          👤 Balanced Partner: <strong>{selectedProvider.name}</strong> ({selectedProvider.matchScore}% Match Score)
                        </div>
                      )}

                      {stageStatus === "completed" && stage.index === 3 && priceQuote && (
                        <div className="timeline-extracted-inline">
                          💰 Billing fare: <strong>{priceQuote.totalPrice} PKR</strong>
                        </div>
                      )}

                      {isOpen && stageTraces.length > 0 && (
                        <div className="timeline-node-body">
                          <div className="reasoning-drawer">
                            {stageTraces.map((trace, idx) => (
                              <div key={idx} className="reasoning-step-item">
                                <div className="reasoning-meta">
                                  <span className="reasoning-agent-badge">{trace.agent}</span>
                                  <span>{trace.timestamp}</span>
                                </div>
                                <div className="reasoning-action">{trace.action}</div>
                                <div className="reasoning-details">{trace.details}</div>
                                {trace.reasoning && (
                                  <div className="reasoning-thoughts">
                                    💡 thoughts: {trace.reasoning}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: DISPATCH TRACKER VIEW */}
        {currentView === "active-booking" && activeBooking && (
          <div className="view-fade-in dispatched-viewport">
            
            {/* Tracking Header */}
            <div className="dispatched-header-card">
              <div className="tracker-status-row">
                <div className="pulse-dot gps"></div>
                <h2>Status: <span className="status-highlight-text">{trackingStatus}</span></h2>
              </div>
              <p>Specialist has initialized transaction <strong>{activeBooking.id}</strong>. Follow active progress stepper below.</p>
            </div>

            {/* Stepper progress bar */}
            <div className="progress-stepper">
              {[
                { label: "Booked", activeKeys: ["Committed to Ledger", "Provider Booked", "Provider En-Route", "Work In Progress", "Completed"] },
                { label: "En-Route", activeKeys: ["Provider En-Route", "Work In Progress", "Completed"] },
                { label: "Arrived", activeKeys: ["Work In Progress", "Completed"] },
                { label: "In Progress", activeKeys: ["Work In Progress", "Completed"] },
                { label: "Completed", activeKeys: ["Completed"] }
              ].map((step, idx) => {
                const isActive = step.activeKeys.includes(trackingStatus);
                return (
                  <div key={idx} className={`stepper-node ${isActive ? "active" : ""}`}>
                    <div className="stepper-dot">
                      {isActive ? "✔" : idx + 1}
                    </div>
                    <span>{step.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Simulated Live Radar Tracker Map */}
            <div className="radar-map-widget">
              <div className="radar-grid"></div>
              <div className="radar-sweep"></div>
              <div className="radar-pin client" title="You"></div>
              <div className={`radar-pin provider ${trackingStatus === "Completed" ? "arrived" : "moving"}`} title={selectedProvider?.name}></div>
              <span className="radar-signal-badge">GPS Signals Live</span>
            </div>

            {/* Dispatched Specialist Card */}
            <div className="specialist-details-card">
              <div className="specialist-header-row">
                <div className="specialist-avatar">
                  <User size={24} />
                </div>
                <div className="specialist-title">
                  <h3>{selectedProvider?.name}</h3>
                  <p>Certified {activeBooking.service}</p>
                </div>
                <a href={`tel:${selectedProvider?.providerPhone}`} className="specialist-call-btn">
                  <Phone size={16} />
                  <span>Call Partner</span>
                </a>
              </div>

              <div className="specialist-info-grid">
                <div className="specialist-info-item">
                  <span className="info-label">Rating</span>
                  <span className="info-value">★ {selectedProvider?.rating}</span>
                </div>
                <div className="specialist-info-item">
                  <span className="info-label">Distance</span>
                  <span className="info-value">{selectedProvider?.calculatedDistance} km</span>
                </div>
                <div className="specialist-info-item">
                  <span className="info-label">Estimated Arrival</span>
                  <span className="info-value">{trackingStatus === "Completed" ? "Arrived" : "~10 mins"}</span>
                </div>
              </div>
            </div>

            {/* Dynamic Receipt Billing Invoice */}
            <div className="billing-invoice-card">
              <h3>Digital Billing Invoice</h3>
              <div className="invoice-divider"></div>
              <div className="invoice-row">
                <span>Base service fare</span>
                <span>{activeBooking.pricing?.basePrice || activeBooking.pricing} PKR</span>
              </div>
              <div className="invoice-row">
                <span>Travel proximity fee</span>
                <span>{activeBooking.pricing?.travelFee || 0} PKR</span>
              </div>
              {activeBooking.pricing?.surgePrice > 0 && (
                <div className="invoice-row surge">
                  <span>Surge price factor</span>
                  <span>+{activeBooking.pricing.surgePrice} PKR</span>
                </div>
              )}
              {activeBooking.pricing?.loyaltyDiscount > 0 && (
                <div className="invoice-row discount">
                  <span>Loyalty discount benefits</span>
                  <span>-{activeBooking.pricing.loyaltyDiscount} PKR</span>
                </div>
              )}
              <div className="invoice-divider dashed"></div>
              <div className="invoice-row total">
                <span>Grand Total:</span>
                <span>{activeBooking.pricing?.totalPrice || activeBooking.pricing} PKR</span>
              </div>
            </div>

            {/* Anomaly / Dispute Simulator Controls */}
            {trackingStatus !== "Completed" && (
              <div className="dispute-simulation-panel">
                <h4>Simulate Operational Anomaly & Self-Healing</h4>
                <p>Test the DisputeAgent's ability to intercept cancellations, re-route providers, and adjust pricing instantly.</p>
                
                <div className="dispute-btns">
                  <button 
                    className="dispute-btn cancel-btn"
                    onClick={() => triggerDisputeScenario("Provider Cancelled")}
                  >
                    <ShieldAlert size={14} />
                    <span>Partner Cancels En-Route</span>
                  </button>
                  <button 
                    className="dispute-btn discount-btn"
                    onClick={() => triggerDisputeScenario("Price Disagreement")}
                  >
                    <DollarSign size={14} />
                    <span>Trigger 10% Fare Dispute</span>
                  </button>
                  <button 
                    className="dispute-btn complain-btn"
                    onClick={() => triggerDisputeScenario("Quality Complaint")}
                  >
                    <AlertTriangle size={14} />
                    <span>Escalate Quality Issue</span>
                  </button>
                </div>
              </div>
            )}

            {/* Active booking completion button */}
            {trackingStatus === "Completed" && (
              <div className="completion-action-bar">
                <button className="confirm-complete-btn" onClick={handleCompleteJob}>
                  Complete Service & Back Home
                </button>
              </div>
            )}
          </div>
        )}

        {/* VIEW 4: PAST BOOKINGS LEDGER RECEIPTS */}
        {currentView === "history" && (
          <div className="view-fade-in history-viewport">
            <div className="history-header">
              <h2>My Bookings Ledger</h2>
              <p>Review persistent historical receipts committed directly to Supabase Cloud or local web storage.</p>
            </div>

            <div className="receipts-scroller">
              {pastBookings.length > 0 ? (
                pastBookings.map((b) => (
                  <div key={b.id} className="digital-receipt card-glow-purple">
                    <div className="receipt-header">
                      <div className="receipt-brand">Hamara Rozgar</div>
                      <span className={`receipt-status-badge ${b.status === "Completed" ? "completed" : "pending"}`}>
                        {b.status}
                      </span>
                    </div>

                    <div className="receipt-barcode">
                      <div className="barcode-stripe"></div>
                      <div className="barcode-stripe"></div>
                      <div className="barcode-stripe"></div>
                      <span className="barcode-text">{b.id}</span>
                    </div>

                    <div className="receipt-body">
                      <div className="receipt-item">
                        <span className="r-label">Date & Time:</span>
                        <span className="r-value">{b.timestamp}</span>
                      </div>
                      <div className="receipt-item">
                        <span className="r-label">Service Type:</span>
                        <span className="r-value">{b.service}</span>
                      </div>
                      <div className="receipt-item">
                        <span className="r-label">Specialist Partner:</span>
                        <span className="r-value">{b.providerName}</span>
                      </div>
                      <div className="receipt-item">
                        <span className="r-label">Location colony:</span>
                        <span className="r-value">{b.location}</span>
                      </div>
                      <div className="receipt-item border-top">
                        <span className="r-label grand">Grand Total paid:</span>
                        <span className="r-value grand">{b.pricing?.totalPrice || b.pricing || "TBD"} PKR</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="history-empty-card">
                  <ShieldAlert size={42} className="empty-history-icon" />
                  <h3>No booking receipts found</h3>
                  <p>You haven't booked any service specialists yet. Head home to orchestrate your first dispatch!</p>
                  <button className="modal-action-btn" onClick={() => setCurrentView("home")}>
                    Book Service Now
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* ⭐ FEEDBACK RATING SUCCESS MODAL */}
      {showFeedbackModal && (
        <div className="feedback-modal-overlay">
          <div className="feedback-modal-card card-glow-purple">
            <div className="star-feedback-glow">
              <Star size={42} fill="var(--accent-purple)" color="var(--accent-purple)" className="star-spin" />
            </div>
            <h2>Service Completed!</h2>
            <p>Thank you for using Hamara Rozgar. Your specialist has been successfully compensated, and the transaction has been securely synchronized with the database ledger.</p>
            
            <div className="rating-select-box">
              <span>Rate Sajid AC Repairs:</span>
              <div className="stars-row">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} size={24} fill="#8b5cf6" color="#8b5cf6" style={{ cursor: "pointer" }} />
                ))}
              </div>
            </div>

            <button className="confirm-complete-btn" onClick={closeFeedbackAndReset}>
              Return to Home Portal
            </button>
          </div>
        </div>
      )}

      {/* 💻 COLLAPSIBLE DEVELOPER SHELL TRACE & REASONING DRAWERS */}
      <footer className={`dev-trace-panel ${showDeveloperTrace ? "expanded" : "collapsed"}`}>
        <button 
          className="dev-trace-toggle-btn"
          onClick={() => setShowDeveloperTrace(!showDeveloperTrace)}
        >
          <Terminal size={14} />
          <span>{showDeveloperTrace ? "Hide Developer Reasoning Trace Logs" : "Show Developer Reasoning Trace Logs"}</span>
          <ChevronUp size={14} className={`dev-cog-expand ${showDeveloperTrace ? "rotate-180" : ""}`} />
        </button>

        {showDeveloperTrace && (
          <div className="dev-trace-container">
            <div className="dev-terminal-header">
              <div className="dots-row">
                <span className="dot red"></span>
                <span className="dot yellow"></span>
                <span className="dot green"></span>
              </div>
              <span className="term-title">antigravity-agentic-orchestrator-shell</span>
              <button className="refresh-logs-btn" onClick={() => setTraceLogs([])}>Clear Console</button>
            </div>

            <div className="dev-terminal-console">
              {traceLogs.length > 0 ? (
                traceLogs.map((log, i) => (
                  <div key={i} className="terminal-line">
                    <span className="term-time">[{log.timestamp}]</span>{" "}
                    <span className="term-agent">{log.agent}</span>:{" "}
                    <span className="term-action">{log.action}</span> - <span className="term-details">{log.details}</span>
                  </div>
                ))
              ) : (
                <div className="terminal-waiting">
                  system: waiting for conversational natural language triggers...
                </div>
              )}
              <div ref={terminalEndRef} />
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}
