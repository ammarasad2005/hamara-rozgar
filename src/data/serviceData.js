// Hamara Rozgar - Geographic Baseline Sector Mapping & Slang Prompts Configuration
// Completely evacuated of any static mock provider lists. Real-time geocoded execution active.

export const sectorsCoordinates = {
  "G-13": { latitude: 33.6409, longitude: 72.9814 },
  "F-10": { latitude: 33.6934, longitude: 73.0076 },
  "I-8": { latitude: 33.6698, longitude: 73.0747 },
  "G-11": { latitude: 33.6644, longitude: 72.9998 },
  "E-11": { latitude: 33.6998, longitude: 72.9734 }
};

export const sampleRequests = [
  {
    text: "AC bilkul kaam nahi kar raha, kal subah G-13 mein technician chahiye, budget zyada nahi hai.",
    type: "Roman Urdu",
    intent: { service: "AC Technician", location: "G-13", time: "tomorrow morning", severity: "high", priceSensitivity: "high" }
  },
  {
    text: "Mujhe g-11 mein bache k liye physics ka home tutor chahye sham 5 bje.",
    type: "Roman Urdu",
    intent: { service: "Tutor", location: "G-11", time: "05:00 PM", severity: "medium", priceSensitivity: "medium" }
  },
  {
    text: "Water leakage in my bathroom kitchen sink, urgent plumber needed in F-10 right now!",
    type: "English",
    intent: { service: "Plumber", location: "F-10", time: "now", severity: "high", priceSensitivity: "medium" }
  },
  {
    text: "الیکٹرک شارٹ سرکٹ ہو گیا ہے، فوری الیکٹریشن بھیجیں جی-13 میں۔",
    type: "Urdu",
    intent: { service: "Electrician", location: "G-13", time: "now", severity: "high", priceSensitivity: "medium" }
  }
];
