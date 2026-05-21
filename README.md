# Hamara-Rozgar (RozgarOrch) 🛠️
### Challenge 2: AI Service Orchestrator for Informal Economy - Google Antigravity Hackathon

Hamara-Rozgar (RozgarOrch) is an agentic, AI-driven marketplace orchestrator designed to automate the end-to-end booking lifecycle for informal service providers (plumbers, electricians, tutors, AC technicians, beauticians, mechanics) in Pakistan. It bridges natural language queries (in Urdu, Roman Urdu, and English) to optimized service provider matches, automated scheduling, dynamic pricing, and real-time execution tracking, accompanied by a live Google Antigravity Agent Trace Console and an on-screen mobile simulator.

---

## 🌟 Key Features

1. **Multilingual Parsing (IntentAgent)**:
   * Native recognition of local Roman Urdu slang, proper Urdu text, and English (e.g. *"AC bilkul kaam nahi kar raha yar"*, *"water leakage"*, *"fauri electrician"*, *"G-13 me plumber"*).
2. **6-Factor Matching & Workload Balancer (DiscoveryAgent)**:
   * Dynamically filters and scores service providers using 6 operational factors: Haversine distance, rating, reliability score, price sensitivity, direct sector matching, and cancellation rate.
3. **Dynamic Pricing Engine (PricingAgent)**:
   * Calculates a fair quote detailing: base rate, distance-based travel allowance, urgency surcharge (+30%), capability-based capacity surge (+15%), and loyalty discount (-10%).
4. **Resilient Transaction Ledger (BookingAgent)**:
   * Integrated with Cloud Firebase Firestore for persistent storage, featuring instant graceful auto-fallback to a reactive local client-side cache in case database API access is pending or disabled.
5. **Auto-Rescheduling & Dispute Resolution (DisputeAgent)**:
   * Simulates real-time edge cases. If a provider cancels post-booking, the orchestrator automatically searches for the next-best provider, transfers the job card, applies compensation vouchers, and notifies the client.
6. **Live Antigravity Trace Console**:
   * Visualizes active agent workplans, status tracking, multi-agent reasoning traces, and API/tool calls in real-time.

---

## 🚀 Getting Started

### 1. Installation
Clone the repository, navigate to the `service-orchestrator` directory, and install dependencies:
```bash
cd service-orchestrator
npm install
```

### 2. Launch Local Server
Start the Vite development server:
```bash
npm run dev
```
Open `http://localhost:5173` in your browser to experience the beautiful interface!

### 3. Connect to Firebase Firestore
A brand new Firebase project `service-orch-ch2-3219` has been provisioned. To activate live synchronization:
1. Go to the [Firebase Console](https://console.firebase.google.com/project/service-orch-ch2-3219/firestore).
2. Click **Create Database** to activate the Cloud Firestore API in your project.
3. Once activated, the app will instantly begin writing persistent bookings to Cloud Firestore natively!

---

## 📱 Building the Standalone Android APK

You can easily compile this into a standalone Android APK using **Capacitor**:

1. Install Capacitor packages:
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android
   ```
2. Initialize config:
   ```bash
   npx cap init "Hamara Rozgar" "com.rozgar.orchestrator" --web-dir=dist
   ```
3. Add Android platform:
   ```bash
   npx cap add android
   ```
4. Build and Sync assets:
   ```bash
   npm run build
   npx cap sync
   ```
5. Open and compile APK in Android Studio:
   ```bash
   npx cap open android
   ```
   In Android Studio, click **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)** to generate the standalone `app-debug.apk` immediately.

---

## 🛠️ Code Structure

* `src/agents/Orchestrator.js` - Multi-agent engine (Intent, Discovery, Pricing, Booking, Follow-up, Dispute agents).
* `src/data/mockProviders.js` - Highly comprehensive mock database of service providers in Islamabad with detailed metrics and Roman Urdu slang request examples.
* `src/firebase.js` - Modular v9 Firebase SDK connection configuration.
* `src/App.jsx` - Coordinates layout, phone frame, dashboard, and the live trace console.
* `src/index.css` - Vanilla CSS stylesheets implementing advanced glassmorphism, outfit fonts, custom scrollbars, and keyframe loading animations.
