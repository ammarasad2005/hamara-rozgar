import React, { useState, useEffect, useRef } from "react";
import { ServiceOrchestrator } from "./agents/Orchestrator";
import { sampleRequests } from "./data/mockProviders";
import { 
  Bot, User, Sparkles, Navigation, Calendar, 
  MapPin, CheckCircle, AlertTriangle, Settings, 
  Briefcase, DollarSign, Star, Send, ShieldCheck,
  ChevronDown, ChevronUp, Terminal, History, Check, ShieldAlert
} from "lucide-react";

export default function App() {
  const [orchestrator, setOrchestrator] = useState(null);
  
  // Dashboard states
  const [traceLogs, setTraceLogs] = useState([]);
  const [workplan, setWorkplan] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [pastBookings, setPastBookings] = useState([]);
  const [activeTab, setActiveTab] = useState("chat"); // "chat" | "ledger"
  
  // Simulator Chat states
  const [chatMessages, setChatMessages] = useState([
    { sender: "bot", text: "Assalam-o-Alaikum! Main Hamara-Rozgar Self-Hosted Orchestrator hoon. Aapko kis kism ki service chahiye? (Urdu, Roman Urdu, or English)" }
  ]);
  const [userInput, setUserInput] = useState("");
  
  // Active workflow booking states
  const [activeIntent, setActiveIntent] = useState(null);
  const [matchedProviders, setMatchedProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [priceQuote, setPriceQuote] = useState(null);
  const [activeBooking, setActiveBooking] = useState(null);
  const [trackingStatus, setTrackingStatus] = useState(null);

  // Configuration Settings & Credentials (Dynamic Widescreen Credentials)
  const [nlpEngine, setNlpEngine] = useState(() => localStorage.getItem("hr_nlp_engine") || "regex"); 
  const [ollamaUrl, setOllamaUrl] = useState(() => localStorage.getItem("hr_ollama_url") || "http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState(() => localStorage.getItem("hr_ollama_model") || "llama3");
  const [groqApiKey, setGroqApiKey] = useState(() => localStorage.getItem("hr_groq_key") || "");
  const [githubToken, setGithubToken] = useState(() => localStorage.getItem("hr_github_token") || "");
  const [githubModel, setGithubModel] = useState(() => localStorage.getItem("hr_github_model") || "gpt-4o");
  const [supabaseUrl, setSupabaseUrl] = useState(() => localStorage.getItem("hr_supabase_url") || "");
  const [supabaseKey, setSupabaseKey] = useState(() => localStorage.getItem("hr_supabase_key") || "");
  
  // Live Status Badge Flags
  const [supabaseConnected, setSupabaseConnected] = useState(false);
  const [mapEngine, setMapEngine] = useState("osm"); // "osm" | "offline"

  // Dynamic Browser Geolocation States
  const [gpsCoords, setGpsCoords] = useState(null); 
  const [customCoords, setCustomCoords] = useState(null);
  const [locationMode, setLocationMode] = useState("GPS"); 
  const [customLocationName, setCustomLocationName] = useState(""); 
  const [resolvedLocationName, setResolvedLocationName] = useState("G-13 (Fallback)");
  const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false);

  // Timeline Expandable Accordions
  const [openTimelineAccordions, setOpenTimelineAccordions] = useState({
    0: false,
    1: false,
    2: false,
    3: false,
    4: false,
    5: false
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
          setResolvedLocationName("GPS Location");
          agent.logAgentTrace(
            "System",
            "GPS Location Fetched",
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
        }
      );
    }

    // Initial load of bookings
    setTimeout(() => {
      loadBookings(agent);
    }, 500);
  }, []);

  // Save Credentials & Auto test connection
  useEffect(() => {
    localStorage.setItem("hr_nlp_engine", nlpEngine);
    localStorage.setItem("hr_ollama_url", ollamaUrl);
    localStorage.setItem("hr_ollama_model", ollamaModel);
    localStorage.setItem("hr_groq_key", groqApiKey);
    localStorage.setItem("hr_github_token", githubToken);
    localStorage.setItem("hr_github_model", githubModel);
    localStorage.setItem("hr_supabase_url", supabaseUrl);
    localStorage.setItem("hr_supabase_key", supabaseKey);
    
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
  }, [nlpEngine, ollamaUrl, ollamaModel, groqApiKey, githubToken, githubModel, supabaseUrl, supabaseKey]);

  // Load bookings when connection flips
  useEffect(() => {
    loadBookings();
  }, [supabaseConnected]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

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
          setResolvedLocationName("GPS Location");
          if (activeAgent) {
            activeAgent.logAgentTrace(
              "System",
              "GPS Location Locked",
              `Latitude: ${coords.latitude}, Longitude: ${coords.longitude}`,
              "Successfully matched browser coordinates for dynamic dispatch."
            );
          }
        },
        (error) => {
          if (activeAgent) {
            activeAgent.logAgentTrace(
              "System",
              "GPS Location Access Blocked",
              error.message,
              "Using G-13 coordinates as absolute default fallback."
            );
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
    } else {
      // Local fallback coordinates
      setCustomCoords({ latitude: 33.6409, longitude: 72.9814 });
      setResolvedLocationName(`${customLocationName} (Local baseline fallback)`);
      orchestrator.logAgentTrace(
        "System",
        "Dynamic Geocoding Fallback Lock",
        "Using default center: Lat: 33.6409, Lng: 72.9814",
        "No live OSM result or search failed. Using G-13 coordinate baseline."
      );
    }
  };

  // Handle NLP request submission
  const handleRequestSubmit = async (text) => {
    if (!text.trim()) return;

    // Direct user to chat tab in case they are looking at the ledger
    setActiveTab("chat");

    // Push user message
    setChatMessages((prev) => [...prev, { sender: "user", text }]);
    setUserInput("");

    if (!orchestrator) return;

    const previousIntent = activeIntent;

    // Reset previous flows
    setActiveIntent(null);
    setMatchedProviders([]);
    setSelectedProvider(null);
    setPriceQuote(null);
    setActiveBooking(null);
    setTrackingStatus(null);

    // Call parsing agent (with GitHub models config support)
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
      chatMessages, 
      previousIntent
    );
    
    let activeCoords = null;
    
    // Check if NLP parser detected a custom address from user's chat input
    const isCustomTextLocation = parsedIntent.location && 
                                 parsedIntent.location !== "G-13" && 
                                 parsedIntent.location !== "GPS Location";

    if (isCustomTextLocation) {
      // Dynamic shift to Custom mode based on chat intent carryover!
      setLocationMode("Custom");
      setCustomLocationName(parsedIntent.location);
      
      orchestrator.logAgentTrace(
        "System",
        "Chat Address Extracted",
        `Detected: "${parsedIntent.location}"`,
        "NLP parser successfully unboxed a custom sector/society. Resolving coordinates automatically."
      );

      // Resolve it on the fly
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
      // Standard flow - check active UI selector toggle
      if (locationMode === "Custom" && customLocationName.trim()) {
        parsedIntent.location = customLocationName.trim();
        if (customCoords) {
          activeCoords = customCoords;
        } else {
          // Resolve customLocationName on the fly
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
        // GPS Mode
        parsedIntent.location = "GPS Location";
        activeCoords = gpsCoords || { latitude: 33.6409, longitude: 72.9814 }; // fallback coordinates
      }
    }
    
    setActiveIntent(parsedIntent);

    if (parsedIntent.confidence < 0.6) {
      setChatMessages((prev) => [
        ...prev, 
        { sender: "bot", text: `I am slightly unsure about your request. Did you mean you need a **${parsedIntent.service}** in **${parsedIntent.location}**? Please type to confirm or refine.` }
      ]);
      return;
    }

    // Call matching agent
    const providers = await orchestrator.discoverAndRank(parsedIntent, { mode: mapEngine }, activeCoords);
    setMatchedProviders(providers);

    if (providers.length === 0) {
      setChatMessages((prev) => [
        ...prev,
        { sender: "bot", text: `Sorry, we could not find any active ${parsedIntent.service}s in ${parsedIntent.location} right now. We have added you to our smart waitlist.` }
      ]);
      return;
    }

    const topProvider = providers[0];
    setSelectedProvider(topProvider);

    // Call pricing agent
    const quote = orchestrator.calculatePricing(topProvider, parsedIntent);
    setPriceQuote(quote);

    setChatMessages((prev) => [
      ...prev,
      { 
        sender: "bot", 
        text: `Behtareen! Humne aapke liye **${topProvider.name}** select kia hai jo **${topProvider.calculatedDistance} km** door hai in **${topProvider.location}**.\n\n* **Dynamic Price Quote**: ${quote.totalPrice} PKR\n* **Estimated Arrival**: ~15 mins\n\nClick **Confirm Booking** to reserve the slot!`,
        actionable: true 
      }
    ]);
  };

  // Confirm booking flow
  const handleConfirmBooking = async () => {
    if (!orchestrator || !selectedProvider || !priceQuote || !activeIntent) return;

    const activeCoords = locationMode === "GPS" ? gpsCoords : customCoords;
    
    // Pass Supabase credentials to persist Booking
    const booking = await orchestrator.simulateBooking(
      selectedProvider, 
      priceQuote, 
      activeIntent, 
      activeCoords,
      { supabaseUrl, supabaseKey }
    );
    
    setActiveBooking(booking);
    setTrackingStatus(booking.status);
    loadBookings(); // sync past ledger list

    setChatMessages((prev) => [
      ...prev,
      { sender: "bot", text: `Mubarak! Aapka slot successfully book ho chuka hai.\n\n🎟️ **Booking ID**: ${booking.id}\n👤 **Provider**: ${booking.providerName}\n📅 **Time**: ${booking.timeSlot}\n\nProvider has unboxed their safety kit and is currently preparing to move!` }
    ]);

    // Start service tracking follow-ups (synced to Supabase database)
    orchestrator.simulateServiceProgress(
      booking, 
      (updatedBooking) => {
        setTrackingStatus(updatedBooking.status);
        loadBookings(); // update ledger
        
        if (updatedBooking.status === "Provider En-Route") {
          setChatMessages((prev) => [...prev, { sender: "bot", text: `🚴 **Update**: ${updatedBooking.providerName} is now moving towards your location in ${updatedBooking.location}.` }]);
        } else if (updatedBooking.status === "Work In Progress") {
          setChatMessages((prev) => [...prev, { sender: "bot", text: `🛠️ **Update**: Provider arrived and has started working on the ${updatedBooking.service} repair.` }]);
        } else if (updatedBooking.status === "Completed") {
          setChatMessages((prev) => [...prev, { sender: "bot", text: `✅ **Update**: Service completed! Kindly rate the provider below.` }]);
        }
      },
      { supabaseUrl, supabaseKey }
    );
  };

  // Handle dispute triggers
  const triggerDisputeScenario = async (type) => {
    if (!orchestrator || !activeBooking) return;
    
    const activeCoords = locationMode === "GPS" ? gpsCoords : customCoords;
    
    await orchestrator.handleDispute(
      activeBooking, 
      type, 
      `Customer simulation triggered: ${type}`, 
      (updatedBooking) => {
        setTrackingStatus(updatedBooking.status);
        loadBookings(); // reload past ledger records
        
        if (type === "Provider Cancelled") {
          setChatMessages((prev) => [
            ...prev, 
            { sender: "bot", text: `⚠️ **Urgent Update**: Provider cancelled the service. Antigravity Auto-Rescheduler has re-routed the request to next-best candidate: **${updatedBooking.providerName}**! Free 150 PKR compensation credit applied.` }
          ]);
          setSelectedProvider(updatedBooking);
        } else if (type === "Price Disagreement") {
          setChatMessages((prev) => [
            ...prev,
            { sender: "bot", text: `⚖️ **Dispute Resolved**: 10% operational discount applied. New billing total is **${updatedBooking.pricing.totalPrice} PKR**.` }
          ]);
        } else if (type === "Quality Complaint") {
          setChatMessages((prev) => [
            ...prev,
            { sender: "bot", text: `🛡️ **Review Registered**: Dispute registered. Case file escalated to human admin panel for review. Provider rating flagged.` }
          ]);
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

  // Filter traces matching specific sequential agent tasks
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

  return (
    <div className="dashboard-container">
      {/* 1. Left Panel: Credentials, Configurations & Workload Balancing Grid */}
      <div className="panel">
        <div className="panel-header">
          <h3 className="panel-title">
            <Briefcase size={18} color="#8b5cf6" />
            Marketplace Control
          </h3>
          <span className="badge active">Live Console</span>
        </div>
        
        <div className="panel-body">
          {/* Supabase Connection Status Badge */}
          <div style={{ marginBottom: "15px" }}>
            <span className={`supabase-status-badge ${supabaseConnected ? "connected" : "offline"}`}>
              <span className={`status-indicator-dot ${supabaseConnected ? "green" : "amber"}`}></span>
              {supabaseConnected ? "Supabase Connected" : "Supabase Offline Fallback"}
            </span>
          </div>

          {/* Credentials Setup Card */}
          <div className="card custom-settings-panel">
            <h4 style={{ fontSize: "0.85rem", color: "var(--accent-purple)", display: "flex", gap: "6px", alignItems: "center" }}>
              <Settings size={14} /> Self-Hosted Credentials
            </h4>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
              <div className="credential-input-group">
                <label style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>NLP Intent Engine</label>
                <select 
                  className="settings-input" 
                  value={nlpEngine}
                  onChange={(e) => setNlpEngine(e.target.value)}
                  style={{ background: "rgba(17, 24, 39, 0.7)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", color: "#fff", padding: "6px 8px", width: "100%", outline: "none" }}
                >
                  <option value="regex">Local Slang Parser (Offline Fallback)</option>
                  <option value="ollama">Ollama (Self-Hosted Local LLM)</option>
                  <option value="groq">Groq Cloud (Free Open LLM)</option>
                  <option value="github">GitHub Models API (High-Fidelity)</option>
                </select>
              </div>

              {nlpEngine === "ollama" && (
                <>
                  <div className="credential-input-group">
                    <label style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>Ollama Server URL</label>
                    <input 
                      type="text" 
                      className="settings-input" 
                      value={ollamaUrl}
                      onChange={(e) => setOllamaUrl(e.target.value)}
                    />
                  </div>
                  <div className="credential-input-group">
                    <label style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>Ollama Model Name</label>
                    <input 
                      type="text" 
                      className="settings-input" 
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                    />
                  </div>
                </>
              )}

              {nlpEngine === "groq" && (
                <div className="credential-input-group">
                  <label style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>Groq Developer API Key</label>
                  <input 
                    type="password" 
                    className="settings-input" 
                    placeholder="gsk_..."
                    value={groqApiKey}
                    onChange={(e) => setGroqApiKey(e.target.value)}
                  />
                </div>
              )}

              {nlpEngine === "github" && (
                <>
                  <div className="credential-input-group">
                    <label style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>GitHub Personal Access Token</label>
                    <input 
                      type="password" 
                      className="settings-input" 
                      placeholder="ghp_..."
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                    />
                  </div>
                  <div className="credential-input-group">
                    <label style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>GitHub Model Selection</label>
                    <input 
                      type="text" 
                      className="settings-input" 
                      placeholder="e.g. gpt-4o, Llama-3-70b"
                      value={githubModel}
                      onChange={(e) => setGithubModel(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div style={{ borderTop: "1px dashed var(--border-color)", margin: "6px 0" }}></div>

              <div className="credential-input-group">
                <label style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>Supabase Project URL</label>
                <input 
                  type="text" 
                  className="settings-input" 
                  placeholder="https://xyz.supabase.co"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                />
              </div>

              <div className="credential-input-group">
                <label style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>Supabase Anon / Service Key</label>
                <input 
                  type="password" 
                  className="settings-input" 
                  placeholder="eyJhbGciOi..."
                  value={supabaseKey}
                  onChange={(e) => setSupabaseKey(e.target.value)}
                />
              </div>

              <div className="credential-input-group">
                <label style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>Geocoding & Places Engine</label>
                <select 
                  className="settings-input" 
                  value={mapEngine}
                  onChange={(e) => setMapEngine(e.target.value)}
                  style={{ background: "rgba(17, 24, 39, 0.7)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", color: "#fff", padding: "6px 8px", width: "100%", outline: "none" }}
                >
                  <option value="osm">OpenStreetMap Nominatim (Free & Dynamic)</option>
                  <option value="offline">Local Dictionary Baseline (Offline)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Provider Workload Balancing Grid */}
          <h4 style={{ fontSize: "0.9rem", color: "#fff", marginBottom: "10px", marginTop: "15px" }}>Provider Workload & Proximity Matrix</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {matchedProviders.length > 0 ? (
              matchedProviders.map((p) => (
                <div key={p.id} className="card" style={{ padding: "12px", marginBottom: "0", background: p.id === selectedProvider?.id ? "rgba(139, 92, 246, 0.08)" : "rgba(255,255,255,0.01)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: "600" }}>
                    <span>{p.name}</span>
                    <span style={{ color: "var(--accent-blue)" }}>{p.matchScore}% Match</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "6px" }}>
                    <span>📍 {p.calculatedDistance} km ({p.location})</span>
                    <span>⭐ {p.rating}</span>
                    <span>⏱️ {p.reliabilityScore}% On-Time</span>
                  </div>
                  {p.cancellationRate > 3 && (
                    <div style={{ fontSize: "0.62rem", color: "#ef4444", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                      <AlertTriangle size={10} /> High cancellation rate ({p.cancellationRate}%)
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "20px", background: "rgba(255,255,255,0.01)", borderRadius: "8px", border: "1px dashed var(--border-color)" }}>
                Enter user query to scan and balance provider workload.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Middle Panel: Native Fullscreen Active Workspace (Chat and Transaction Ledger Tabs) */}
      <div className="workspace-section">
        {/* Navigation Tabs */}
        <div className="tab-nav-container">
          <button 
            className={`tab-nav-btn ${activeTab === "chat" ? "active" : ""}`}
            onClick={() => setActiveTab("chat")}
          >
            <Sparkles size={14} style={{ display: "inline-block", marginRight: "6px", verticalAlign: "middle" }} />
            Active Workspace (Chat)
          </button>
          <button 
            className={`tab-nav-btn ${activeTab === "ledger" ? "active" : ""}`}
            onClick={() => setActiveTab("ledger")}
          >
            <History size={14} style={{ display: "inline-block", marginRight: "6px", verticalAlign: "middle" }} />
            Past Transactions Ledger
          </button>
        </div>

        {/* Tab Content 1: Chat Interaction Flow */}
        {activeTab === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
            {/* Branding Header */}
            <div className="app-header">
              <Sparkles size={22} color="#8b5cf6" />
              <div className="app-title-group">
                <div className="app-title">Hamara-Rozgar Dashboard</div>
                <div className="app-subtitle">Informal Marketplace Multi-Agent System</div>
              </div>
              <ShieldCheck size={22} color="var(--accent-green)" />
            </div>

            {/* Proximity Location Hub Banner */}
            <div className="location-hub-banner">
              <div className="location-hub-main" onClick={() => setIsLocationMenuOpen(!isLocationMenuOpen)}>
                <div className="location-status-group">
                  <span className={`pulse-dot ${locationMode === "GPS" ? "gps" : "custom"}`}></span>
                  <div className="location-info">
                    <span className="location-mode-label">
                      {locationMode === "GPS" ? "📍 Live Proximity GPS Lock" : "📍 Custom Landmark Override"}
                    </span>
                    <span className="location-value-text">
                      {locationMode === "GPS" 
                        ? (gpsCoords ? `${gpsCoords.latitude.toFixed(5)}, ${gpsCoords.longitude.toFixed(5)}` : "Fetching GPS from device...") 
                        : (customLocationName || "Resolve custom sector/society string...")}
                    </span>
                  </div>
                </div>
                <button className="location-expand-btn">
                  <Settings size={14} className={isLocationMenuOpen ? "rotate-90" : ""} />
                </button>
              </div>

              {/* Collapsible Location Selector Menu */}
              {isLocationMenuOpen && (
                <div className="location-menu-panel">
                  <div className="location-menu-tabs">
                    <button 
                      className={`location-tab-btn ${locationMode === "GPS" ? "active" : ""}`}
                      onClick={() => handleToggleLocationMode("GPS")}
                    >
                      GPS Device Lock
                    </button>
                    <button 
                      className={`location-tab-btn ${locationMode === "Custom" ? "active" : ""}`}
                      onClick={() => handleToggleLocationMode("Custom")}
                    >
                      Landmark Geocode
                    </button>
                  </div>

                  {locationMode === "GPS" ? (
                    <div className="location-tab-content">
                      <div className="coords-display-box">
                        {gpsCoords ? (
                          <>
                            <div className="coords-row"><span>Browser Latitude:</span> <span>{gpsCoords.latitude.toFixed(6)}</span></div>
                            <div className="coords-row"><span>Browser Longitude:</span> <span>{gpsCoords.longitude.toFixed(6)}</span></div>
                            <span className="location-badge success">Direct GPS coordinates locked</span>
                          </>
                        ) : (
                          <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                            Live browser Geolocation blocked or pending.
                            <button className="text-btn" onClick={() => triggerGpsFetch()} style={{ display: "block", margin: "6px auto 0 auto" }}>
                              🔄 Re-request Device GPS
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="location-tab-content">
                      <div className="custom-input-group">
                        <input 
                          type="text" 
                          className="custom-loc-input" 
                          placeholder="E.g. sector 4 airport society, G-11, F-10"
                          value={customLocationName}
                          onChange={(e) => setCustomLocationName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleResolveCustomLocation()}
                        />
                        <button 
                          className="action-btn-sm" 
                          onClick={handleResolveCustomLocation}
                          disabled={!customLocationName.trim()}
                        >
                          Geocode
                        </button>
                      </div>
                      
                      {customCoords && (
                        <div className="coords-display-box" style={{ marginTop: "8px" }}>
                          <div className="coords-row"><span>OSM Resolved Lat:</span> <span>{customCoords.latitude.toFixed(6)}</span></div>
                          <div className="coords-row"><span>OSM Resolved Lng:</span> <span>{customCoords.longitude.toFixed(6)}</span></div>
                          <span className="location-badge custom">📍 Geocoded from OpenStreetMap</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Scrollable chat interaction log */}
            <div className="chat-area">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`chat-bubble ${msg.sender}`}>
                  <div style={{ whiteSpace: "pre-line" }}>{msg.text}</div>
                  
                  {/* Confirm Dispatch button inside message context */}
                  {msg.actionable && !activeBooking && (
                    <button 
                      onClick={handleConfirmBooking}
                      style={{
                        marginTop: "12px",
                        padding: "10px 20px",
                        background: "#fff",
                        color: "var(--bg-primary)",
                        border: "none",
                        borderRadius: "24px",
                        fontSize: "0.85rem",
                        fontWeight: "600",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        width: "100%",
                        transition: "all 0.2s"
                      }}
                      onMouseOver={(e) => e.target.style.transform = "translateY(-1px)"}
                      onMouseOut={(e) => e.target.style.transform = "none"}
                    >
                      <Check size={16} /> Confirm Booking & Sync to Ledger
                    </button>
                  )}
                </div>
              ))}

              {/* Active Booking Tracker Dashboard Widget */}
              {activeBooking && (
                <div className="card" style={{ padding: "16px", background: "rgba(0,0,0,0.3)", borderRadius: "14px", border: "1px solid rgba(139, 92, 246, 0.2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", fontWeight: "600", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px", marginBottom: "10px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Navigation size={14} className="pulse-dot gps" /> Active Status: <span style={{ color: "var(--accent-blue)" }}>{trackingStatus}</span>
                    </span>
                    <span style={{ color: "var(--accent-green)" }}>{activeBooking.pricing.totalPrice} PKR</span>
                  </div>
                  
                  {/* Route Mapping Simulation */}
                  <div className="map-view" style={{ height: "140px" }}>
                    <div className="map-grid"></div>
                    <div className="map-pin"></div>
                    <div className="map-pin provider"></div>
                    <div className="map-route"></div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Sector Proximity: <strong>{activeBooking.location}</strong></span>
                      <span>Dispatch Partner: <strong>{selectedProvider?.name}</strong></span>
                    </div>
                    {activeBooking.locationCoords && (
                      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", fontSize: "0.68rem", marginTop: "4px" }}>
                        <span>Coords: {activeBooking.locationCoords.latitude.toFixed(5)}, {activeBooking.locationCoords.longitude.toFixed(5)}</span>
                        <span>Travel Proximity: {selectedProvider?.calculatedDistance} km</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* simulated dispute options */}
              {activeBooking && trackingStatus !== "Completed" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "rgba(255, 255, 255, 0.02)", padding: "12px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.03em" }}>Simulate Edge Cases & Dispute Audits</span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => triggerDisputeScenario("Provider Cancelled")} style={{ flex: 1, padding: "8px 4px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px", fontSize: "0.72rem", color: "#ef4444", fontWeight: "600", cursor: "pointer", transition: "all 0.2s" }}>
                      Partner Cancel Reschedule
                    </button>
                    <button onClick={() => triggerDisputeScenario("Price Disagreement")} style={{ flex: 1, padding: "8px 4px", background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "8px", fontSize: "0.72rem", color: "#f59e0b", fontWeight: "600", cursor: "pointer", transition: "all 0.2s" }}>
                      10% Price Dispute
                    </button>
                    <button onClick={() => triggerDisputeScenario("Quality Complaint")} style={{ flex: 1, padding: "8px 4px", background: "rgba(139, 92, 246, 0.1)", border: "1px solid rgba(139, 92, 246, 0.3)", borderRadius: "8px", fontSize: "0.72rem", color: "#8b5cf6", fontWeight: "600", cursor: "pointer", transition: "all 0.2s" }}>
                      Escalate Quality Issue
                    </button>
                  </div>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            {/* Quick Testing Suggestions Bar */}
            <div style={{ padding: "8px 20px", background: "var(--bg-secondary)", borderTop: "1px solid var(--border-color)" }}>
              <div className="chip-group" style={{ margin: "2px 0 6px 0" }}>
                {sampleRequests.map((req, i) => (
                  <span 
                    key={i} 
                    className="chip"
                    onClick={() => handleRequestSubmit(req.text)}
                  >
                    💬 {req.text.length > 32 ? req.text.substring(0, 32) + "..." : req.text}
                  </span>
                ))}
              </div>
            </div>

            {/* Bottom Input Area */}
            <div className="chat-input-bar">
              <input 
                type="text" 
                className="chat-input" 
                placeholder="Ask in Roman Urdu or English (e.g., 'AC technician urgently in sector 4 airport society')"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRequestSubmit(userInput)}
              />
              <button className="round-btn" onClick={() => handleRequestSubmit(userInput)}>
                <Send size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Tab Content 2: Past Transactions Ledger Database Grid */}
        {activeTab === "ledger" && (
          <div className="ledger-container">
            <div className="ledger-header">
              <div>
                <h3 style={{ fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "8px" }}>
                  <History size={18} color="var(--accent-purple)" />
                  Transaction Ledger Database
                </h3>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Dynamic persistent ledger synced to Supabase Cloud or offline web storage
                </span>
              </div>
              <button 
                className="action-btn-sm" 
                onClick={() => loadBookings()}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                🔄 Refresh Ledger
              </button>
            </div>

            <div className="ledger-grid">
              {pastBookings.length > 0 ? (
                pastBookings.map((b) => (
                  <div key={b.id} className="ledger-card">
                    <div className="ledger-card-row" style={{ borderBottom: "1px dashed var(--border-color)", paddingBottom: "6px" }}>
                      <span className="ledger-value mono" style={{ color: "var(--accent-purple)", fontWeight: "700" }}>{b.id}</span>
                      <span className="ledger-value" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{b.timestamp}</span>
                    </div>

                    <div className="ledger-card-row">
                      <span className="ledger-label">Service Type:</span>
                      <span className="ledger-value">{b.service}</span>
                    </div>

                    <div className="ledger-card-row">
                      <span className="ledger-label">Provider Name:</span>
                      <span className="ledger-value">{b.providerName}</span>
                    </div>

                    <div className="ledger-card-row">
                      <span className="ledger-label">Provider Contact:</span>
                      <span className="ledger-value mono">{b.providerPhone}</span>
                    </div>

                    <div className="ledger-card-row">
                      <span className="ledger-label">Target Location:</span>
                      <span className="ledger-value">{b.location}</span>
                    </div>

                    <div className="ledger-card-row">
                      <span className="ledger-label">Assigned Slot:</span>
                      <span className="ledger-value">{b.timeSlot}</span>
                    </div>

                    <div className="ledger-card-row">
                      <span className="ledger-label">Billing Amount:</span>
                      <span className="ledger-value" style={{ color: "var(--accent-green)", fontWeight: "600" }}>
                        {b.pricing?.totalPrice || b.pricing || "TBD"} PKR
                      </span>
                    </div>

                    <div className="ledger-card-row" style={{ marginTop: "4px", borderTop: "1px solid var(--border-color)", paddingTop: "6px" }}>
                      <span className="ledger-label">Status:</span>
                      <span className={`badge ${
                        b.status === "Completed" ? "active" : 
                        b.status?.includes("Disputed") ? "error" : "pending"
                      }`} style={{ fontSize: "0.62rem" }}>
                        {b.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                  <ShieldAlert size={36} style={{ margin: "0 auto 10px auto", opacity: 0.5 }} />
                  No transaction ledger entries found. Perform your first service dispatch booking!
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Right Panel: Chronological Agentic Timeline Tree & Monospace Dev Console */}
      <div className="panel trace-panel">
        <div className="panel-header">
          <h3 className="panel-title">
            <Sparkles size={18} color="var(--accent-purple)" />
            Operations & Reasoning
          </h3>
          <span className="badge" style={{ background: "rgba(139, 92, 246, 0.15)", color: "var(--accent-purple)" }}>Trace active</span>
        </div>

        <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "20px", overflowY: "auto" }}>
          {/* Chronological Agentic Stage-by-Stage Timeline Tree */}
          <div>
            <h4 style={{ fontSize: "0.85rem", color: "var(--accent-purple)", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Chronological agent execution tree
            </h4>
            
            <div className="timeline-container">
              {[
                { title: "Intent Parsing & Conversational Semantics", index: 0, desc: "Multilingual Roman Urdu/English intent unboxing" },
                { title: "Proximity Location Geocoding", index: 1, desc: "OpenStreetMap Nominatim custom address coordinate mapping" },
                { title: "Registry Scan & Workload Balancing", index: 2, desc: "6-factor operational matching algorithm utility computation" },
                { title: "Dynamic Quote Pricing Engine", index: 3, desc: "Compute travel allowance surcharges & loyalty deductions" },
                { title: "Secure Persistent Ledger Transaction", index: 4, desc: "Commit persistent transactional row to Supabase Cloud" },
                { title: "Real-time Tracking & Dispute Escalations", index: 5, desc: "Monitor partner GPS signals and execute reschedule audits" }
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
                    {/* Icon wrapper connector on the absolute tree line */}
                    <div className="timeline-icon-wrapper">
                      <span className={`timeline-dot ${stageStatus}`}></span>
                    </div>

                    {/* Accordion Toggle Header */}
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

                    {/* Sub-description */}
                    <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", paddingLeft: "0px", marginTop: "-2px" }}>
                      {stage.desc}
                    </div>

                    {/* Accordion Reasoning Drawer body */}
                    {isOpen && stageTraces.length > 0 && (
                      <div className="timeline-node-body">
                        <div className="reasoning-drawer">
                          {stageTraces.map((trace, idx) => (
                            <div key={idx} className="reasoning-step-item">
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                <span className="reasoning-agent-badge">{trace.agent}</span>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.62rem" }}>{trace.timestamp}</span>
                              </div>
                              <div style={{ color: "#fff", fontWeight: "600", fontSize: "0.72rem", marginBottom: "2px" }}>
                                {trace.action}
                              </div>
                              <div style={{ color: "var(--text-secondary)", fontSize: "0.68rem" }}>
                                {trace.details}
                              </div>
                              {trace.reasoning && (
                                <div style={{ color: "#06b6d4", fontSize: "0.68rem", background: "rgba(6, 182, 212, 0.05)", borderLeft: "2px solid #06b6d4", padding: "4px 8px", margin: "6px 0 2px 0", fontStyle: "italic" }}>
                                  💡 reasoning: {trace.reasoning}
                                </div>
                              )}
                              {trace.tool && (
                                <div style={{ fontSize: "0.62rem", color: "var(--accent-purple)", marginTop: "4px", fontWeight: "600" }}>
                                  🛠️ tool_executed: `{trace.tool}`
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

          {/* Dev Shell Console Output */}
          <div style={{ marginTop: "auto" }}>
            <div className="terminal-header">
              <div className="terminal-dots">
                <span className="terminal-dot-ui red"></span>
                <span className="terminal-dot-ui yellow"></span>
                <span className="terminal-dot-ui green"></span>
              </div>
              <span>antigravity-agentic-orchestrator-shell</span>
            </div>
            
            <div className="terminal-console">
              {traceLogs.length > 0 ? (
                traceLogs.map((log, i) => (
                  <div key={i} className="terminal-line">
                    <span style={{ color: "var(--accent-purple)" }}>[{log.timestamp}]</span>{" "}
                    <span style={{ color: "#10b981" }}>{log.agent}</span>:{" "}
                    <span>{log.action}</span> - <span style={{ color: "var(--text-secondary)" }}>{log.details.substring(0, 100)}{log.details.length > 100 ? "..." : ""}</span>
                  </div>
                ))
              ) : (
                <div style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                  system: waiting for conversational natural language triggers...
                </div>
              )}
              <div ref={terminalEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
