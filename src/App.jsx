import React, { useState, useEffect, useRef } from "react";
import { ServiceOrchestrator } from "./agents/Orchestrator";
import { sampleRequests } from "./data/mockProviders";
import { 
  Bot, User, Sparkles, Navigation, Calendar, 
  MapPin, CheckCircle, AlertTriangle, Settings, 
  Briefcase, DollarSign, Star, Send, ShieldCheck
} from "lucide-react";

export default function App() {
  const [orchestrator, setOrchestrator] = useState(null);
  
  // Dashboard states
  const [traceLogs, setTraceLogs] = useState([]);
  const [workplan, setWorkplan] = useState([]);
  const [tasks, setTasks] = useState([]);
  
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

  // Configuration Settings (100% Open-Source & Self-Hosted Stack)
  const [nlpEngine, setNlpEngine] = useState("regex"); // "regex" | "ollama" | "groq"
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState("llama3");
  const [groqApiKey, setGroqApiKey] = useState("");
  const [mapEngine, setMapEngine] = useState("osm"); // "osm" | "offline"

  // Dynamic Browser Geolocation States
  const [gpsCoords, setGpsCoords] = useState(null); 
  const [customCoords, setCustomCoords] = useState(null);
  const [locationMode, setLocationMode] = useState("GPS"); 
  const [customLocationName, setCustomLocationName] = useState(""); 
  const [resolvedLocationName, setResolvedLocationName] = useState("G-13 (Fallback)");
  const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false);

  const chatEndRef = useRef(null);
  const traceEndRef = useRef(null);

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
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

    // Call parsing agent
    const parsedIntent = await orchestrator.parseIntent(
      text, 
      { mode: nlpEngine, ollamaUrl, ollamaModel, groqKey: groqApiKey }, 
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
    const booking = await orchestrator.simulateBooking(selectedProvider, priceQuote, activeIntent, activeCoords);
    setActiveBooking(booking);
    setTrackingStatus(booking.status);

    setChatMessages((prev) => [
      ...prev,
      { sender: "bot", text: `Mubarak! Aapka slot successfully book ho chuka hai.\n\n🎟️ **Booking ID**: ${booking.id}\n👤 **Provider**: ${booking.providerName}\n📅 **Time**: ${booking.timeSlot}\n\nProvider has unboxed their safety kit and is currently preparing to move!` }
    ]);

    // Start service tracking follow-ups
    orchestrator.simulateServiceProgress(booking, (updatedBooking) => {
      setTrackingStatus(updatedBooking.status);
      
      if (updatedBooking.status === "Provider En-Route") {
        setChatMessages((prev) => [...prev, { sender: "bot", text: `🚴 **Update**: ${updatedBooking.providerName} is now moving towards your location in ${updatedBooking.location}.` }]);
      } else if (updatedBooking.status === "Work In Progress") {
        setChatMessages((prev) => [...prev, { sender: "bot", text: `🛠️ **Update**: Provider arrived and has started working on the ${updatedBooking.service} repair.` }]);
      } else if (updatedBooking.status === "Completed") {
        setChatMessages((prev) => [...prev, { sender: "bot", text: `✅ **Update**: Service completed! Kindly rate the provider below.` }]);
      }
    });
  };

  // Handle dispute triggers
  const triggerDisputeScenario = async (type) => {
    if (!orchestrator || !activeBooking) return;
    
    const activeCoords = locationMode === "GPS" ? gpsCoords : customCoords;
    
    await orchestrator.handleDispute(activeBooking, type, `Customer simulation triggered: ${type}`, (updatedBooking) => {
      setTrackingStatus(updatedBooking.status);
      
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
    }, { mode: mapEngine }, activeCoords);
  };

  return (
    <div className="dashboard-container">
      {/* 1. Provider Workload and Settings Console */}
      <div className="panel">
        <div className="panel-header">
          <h3 className="panel-title">
            <Briefcase size={18} color="#8b5cf6" />
            Marketplace Control
          </h3>
          <span className="badge active">Live</span>
        </div>
        
        <div className="panel-body">
          {/* Active Settings */}
          <div className="card custom-settings-panel">
            <h4 style={{ fontSize: "0.85rem", color: "var(--accent-purple)", display: "flex", gap: "6px", alignItems: "center" }}>
              <Settings size={14} /> Self-Hosted Configurations
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
              <div>
                <label style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>NLP Intent Engine</label>
                <select 
                  className="settings-input" 
                  value={nlpEngine}
                  onChange={(e) => setNlpEngine(e.target.value)}
                  style={{ background: "rgba(17, 24, 39, 0.7)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", color: "#fff", padding: "4px 8px", width: "100%", outline: "none" }}
                >
                  <option value="regex">Local Slang Parser (Offline Fallback)</option>
                  <option value="ollama">Ollama (Self-Hosted Local LLM)</option>
                  <option value="groq">Groq Cloud (Free Open LLM)</option>
                </select>
              </div>

              {nlpEngine === "ollama" && (
                <>
                  <div>
                    <label style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Ollama Server URL</label>
                    <input 
                      type="text" 
                      className="settings-input" 
                      value={ollamaUrl}
                      onChange={(e) => setOllamaUrl(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Ollama Model Name</label>
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
                <div>
                  <label style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Groq Developer API Key</label>
                  <input 
                    type="password" 
                    className="settings-input" 
                    placeholder="Paste Groq API Key..."
                    value={groqApiKey}
                    onChange={(e) => setGroqApiKey(e.target.value)}
                  />
                </div>
              )}

              <div>
                <label style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Geocoding & Places Engine</label>
                <select 
                  className="settings-input" 
                  value={mapEngine}
                  onChange={(e) => setMapEngine(e.target.value)}
                  style={{ background: "rgba(17, 24, 39, 0.7)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", color: "#fff", padding: "4px 8px", width: "100%", outline: "none" }}
                >
                  <option value="osm">OpenStreetMap Nominatim (Free & Dynamic)</option>
                  <option value="offline">Local Dictionary Baseline (Offline)</option>
                </select>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                <span className={`badge ${mapEngine === "osm" ? "active" : "pending"}`} style={{ fontSize: "0.6rem" }}>
                  {mapEngine === "osm" ? "OSM Nominatim Active" : "Offline Baseline Mode"}
                </span>
                <span className={`badge ${nlpEngine !== "regex" ? "active" : "pending"}`} style={{ fontSize: "0.6rem" }}>
                  {nlpEngine === "regex" ? "Offline Slang Parser" : nlpEngine === "ollama" ? `Ollama: ${ollamaModel}` : "Groq Llama 3 Active"}
                </span>
                <span className="badge success" style={{ fontSize: "0.6rem" }}>
                  Database: Local Web Storage
                </span>
              </div>
            </div>
          </div>

          {/* Provider Workload Index */}
          <h4 style={{ fontSize: "0.9rem", color: "#fff", marginBottom: "10px", marginTop: "15px" }}>Provider Workload & Balance</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {matchedProviders.length > 0 ? (
              matchedProviders.map((p) => (
                <div key={p.id} className="card" style={{ padding: "12px", marginBottom: "0", background: p.id === selectedProvider?.id ? "rgba(139, 92, 246, 0.1)" : "rgba(255,255,255,0.02)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: "600" }}>
                    <span>{p.name}</span>
                    <span style={{ color: "var(--accent-blue)" }}>{p.matchScore}% Match</span>
                  </div>
                  <div style={{ display: "flex", gap: "10px", fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                    <span>📍 {p.calculatedDistance} km ({p.location})</span>
                    <span>⭐ {p.rating}</span>
                    <span>⏱️ {p.reliabilityScore}% On-Time</span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "20px" }}>
                Enter user query to scan and balance provider workload.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Interactive Mobile Smartphone Frame Simulator */}
      <div className="mobile-simulator-section">
        <div className="phone-frame">
          <div className="phone-notch"></div>
          <div className="phone-screen">
            {/* App Header bar */}
            <div className="app-header">
              <Sparkles size={20} color="#8b5cf6" />
              <div className="app-title-group">
                <div className="app-title">Hamara-Rozgar (RozgarOrch)</div>
                <div className="app-subtitle">Informal Economy AI Orchestrator</div>
              </div>
              <ShieldCheck size={20} color="var(--accent-green)" />
            </div>

            {/* Proximity Location Hub Banner */}
            <div className="location-hub-banner">
              <div className="location-hub-main" onClick={() => setIsLocationMenuOpen(!isLocationMenuOpen)}>
                <div className="location-status-group">
                  <span className={`pulse-dot ${locationMode === "GPS" ? "gps" : "custom"}`}></span>
                  <div className="location-info">
                    <span className="location-mode-label">
                      {locationMode === "GPS" ? "📍 Live GPS Location" : "📍 Custom Proximity Override"}
                    </span>
                    <span className="location-value-text">
                      {locationMode === "GPS" 
                        ? (gpsCoords ? `${gpsCoords.latitude.toFixed(4)}, ${gpsCoords.longitude.toFixed(4)}` : "Fetching GPS...") 
                        : (customLocationName || "Type custom sector/landmark...")}
                    </span>
                  </div>
                </div>
                <button className="location-expand-btn">
                  <Settings size={14} className={isLocationMenuOpen ? "rotate-90" : ""} />
                </button>
              </div>

              {/* Collapsible Panel */}
              {isLocationMenuOpen && (
                <div className="location-menu-panel">
                  <div className="location-menu-tabs">
                    <button 
                      className={`location-tab-btn ${locationMode === "GPS" ? "active" : ""}`}
                      onClick={() => handleToggleLocationMode("GPS")}
                    >
                      Use GPS
                    </button>
                    <button 
                      className={`location-tab-btn ${locationMode === "Custom" ? "active" : ""}`}
                      onClick={() => handleToggleLocationMode("Custom")}
                    >
                      Use Custom Input
                    </button>
                  </div>

                  {locationMode === "GPS" ? (
                    <div className="location-tab-content">
                      <div className="coords-display-box">
                        {gpsCoords ? (
                          <>
                            <div className="coords-row"><span>Latitude:</span> <span>{gpsCoords.latitude.toFixed(6)}</span></div>
                            <div className="coords-row"><span>Longitude:</span> <span>{gpsCoords.longitude.toFixed(6)}</span></div>
                            <span className="location-badge success">Live Browser Lock</span>
                          </>
                        ) : (
                          <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                            GPS access blocked or not loaded.
                            <button className="text-btn" onClick={() => triggerGpsFetch()} style={{ display: "block", margin: "6px auto 0 auto" }}>
                              🔄 Retry GPS Fetch
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
                          placeholder="Type address (e.g. sector 4 airport society)"
                          value={customLocationName}
                          onChange={(e) => setCustomLocationName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleResolveCustomLocation()}
                        />
                        <button 
                          className="action-btn-sm" 
                          onClick={handleResolveCustomLocation}
                          disabled={!customLocationName.trim()}
                        >
                          Resolve
                        </button>
                      </div>
                      
                      {customCoords && (
                        <div className="coords-display-box" style={{ marginTop: "8px" }}>
                          <div className="coords-row"><span>Lat:</span> <span>{customCoords.latitude.toFixed(6)}</span></div>
                          <div className="coords-row"><span>Lng:</span> <span>{customCoords.longitude.toFixed(6)}</span></div>
                          <span className="location-badge custom">📍 Dynamically Geocoded</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Main scrollable app area */}
            <div className="chat-area">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`chat-bubble ${msg.sender}`}>
                  <div style={{ whiteSpace: "pre-line" }}>{msg.text}</div>
                  
                  {/* Actionable buttons */}
                  {msg.actionable && !activeBooking && (
                    <button 
                      onClick={handleConfirmBooking}
                      style={{
                        marginTop: "10px",
                        padding: "8px 16px",
                        background: "#fff",
                        color: "var(--bg-primary)",
                        border: "none",
                        borderRadius: "20px",
                        fontSize: "0.75rem",
                        fontWeight: "600",
                        cursor: "pointer",
                        width: "100%"
                      }}
                    >
                      Confirm Booking & Dispatch
                    </button>
                  )}
                </div>
              ))}

              {/* Booking Track Map View */}
              {activeBooking && (
                <div className="card" style={{ padding: "12px", background: "rgba(0,0,0,0.3)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", fontWeight: "600" }}>
                    <span>📍 Tracking: {trackingStatus}</span>
                    <span style={{ color: "var(--accent-green)" }}>{activeBooking.pricing.totalPrice} PKR</span>
                  </div>
                  <div className="map-view">
                    <div className="map-grid"></div>
                    <div className="map-pin"></div>
                    <div className="map-pin provider"></div>
                    <div className="map-route"></div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.65rem", color: "var(--text-secondary)", marginTop: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Customer: {activeBooking.location}</span>
                      <span>Provider: {selectedProvider?.location}</span>
                    </div>
                    {activeBooking.locationCoords && (
                      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", fontSize: "0.6rem" }}>
                        <span>Coords: {activeBooking.locationCoords.latitude.toFixed(4)}, {activeBooking.locationCoords.longitude.toFixed(4)}</span>
                        <span>Distance: {selectedProvider?.calculatedDistance} km</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Post-booking dispute options */}
              {activeBooking && trackingStatus !== "Completed" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", alignSelf: "center" }}>Simulate Edge Cases & Disputes</span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => triggerDisputeScenario("Provider Cancelled")} style={{ flex: 1, padding: "6px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid #ef4444", borderRadius: "8px", fontSize: "0.65rem", color: "#ef4444", cursor: "pointer" }}>
                      Provider Cancel
                    </button>
                    <button onClick={() => triggerDisputeScenario("Price Disagreement")} style={{ flex: 1, padding: "6px", background: "rgba(245, 158, 11, 0.15)", border: "1px solid #f59e0b", borderRadius: "8px", fontSize: "0.65rem", color: "#f59e0b", cursor: "pointer" }}>
                      Price Dispute
                    </button>
                    <button onClick={() => triggerDisputeScenario("Quality Complaint")} style={{ flex: 1, padding: "6px", background: "rgba(139, 92, 246, 0.15)", border: "1px solid #8b5cf6", borderRadius: "8px", fontSize: "0.65rem", color: "#8b5cf6", cursor: "pointer" }}>
                      Quality Issue
                    </button>
                  </div>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            {/* Quick Testing slangs Chips */}
            <div style={{ padding: "0 14px", background: "var(--bg-secondary)" }}>
              <div className="chip-group" style={{ margin: "6px 0 10px 0" }}>
                {sampleRequests.map((req, i) => (
                  <span 
                    key={i} 
                    className="chip"
                    onClick={() => handleRequestSubmit(req.text)}
                  >
                    💬 {req.text.length > 25 ? req.text.substring(0, 25) + "..." : req.text}
                  </span>
                ))}
              </div>
            </div>

            {/* Chat inputs */}
            <div className="chat-input-bar">
              <input 
                type="text" 
                className="chat-input" 
                placeholder="Type in Roman Urdu, English..."
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRequestSubmit(userInput)}
              />
              <button className="round-btn" onClick={() => handleRequestSubmit(userInput)}>
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Google Antigravity Agent Trace Console */}
      <div className="panel trace-panel">
        <div className="panel-header">
          <h3 className="panel-title">
            <Sparkles size={18} color="var(--accent-purple)" />
            Antigravity Trace Console
          </h3>
          <span className="badge" style={{ background: "rgba(139, 92, 246, 0.15)", color: "var(--accent-purple)" }}>IDE Log Mode</span>
        </div>

        <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Workplan progress */}
          <div>
            <h4 style={{ fontSize: "0.85rem", color: "var(--accent-purple)", marginBottom: "8px" }}>Active Orchestration Plan</h4>
            <div className="workplan-list">
              {tasks.length > 0 ? (
                tasks.map((task, i) => (
                  <div key={i} className="workplan-item">
                     <span className={`progress-dot ${task.status}`}></span>
                    <span style={{ color: task.status === "completed" ? "var(--text-muted)" : "#fff" }}>{task.text}</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Trace log is idle. Waiting for natural language request parsing.
                </div>
              )}
            </div>
          </div>

          {/* Expandable Agent Reasoning steps */}
          <div>
            <h4 style={{ fontSize: "0.85rem", color: "var(--accent-purple)", marginBottom: "8px" }}>Orchestrator reasoning traces</h4>
            <div className="trace-list">
              {traceLogs.length > 0 ? (
                traceLogs.map((log, i) => (
                  <div key={i} className={`trace-item ${log.agent.toLowerCase().replace("agent", "")}`}>
                    <div className="trace-meta">
                      <span>🤖 {log.agent}</span>
                      <span>{log.timestamp}</span>
                    </div>
                    <div style={{ color: "#fff", fontWeight: "600", fontSize: "0.75rem", marginBottom: "4px" }}>
                      {log.action}
                    </div>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.7rem", marginBottom: "4px" }}>
                      {log.details}
                    </div>
                    {log.reasoning && (
                      <div style={{ color: "var(--accent-purple)", fontSize: "0.65rem", background: "rgba(139, 92, 246, 0.05)", padding: "4px 8px", borderRadius: "4px", marginTop: "4px" }}>
                        💡 **Reasoning**: {log.reasoning}
                      </div>
                    )}
                    {log.tool && (
                      <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", marginTop: "4px" }}>
                        🛠️ **Tool Used**: `{log.tool}`
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "20px" }}>
                  Reasoning traces will automatically output as agents coordinate intent, pricing, mapping, and ledger transactions.
                </div>
              )}
              <div ref={traceEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
