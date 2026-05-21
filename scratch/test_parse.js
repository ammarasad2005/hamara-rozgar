const rawInput = "meri motorcycle khrab ho gyi hai";
let service = "AC Technician"; // default
let location = "G-13"; // default
let confidence = 0.85;

const lowerInput = rawInput.toLowerCase();

if (lowerInput.includes("ac") || lowerInput.includes("air conditioner") || lowerInput.includes("ایسی") || lowerInput.includes("cooling") || lowerInput.includes("cooler")) {
  service = "AC Technician";
} else if (lowerInput.includes("plumber") || lowerInput.includes("pipe") || lowerInput.includes("leakage") || lowerInput.includes("नल") || lowerInput.includes("پلمبر") || lowerInput.includes("toti") || lowerInput.includes("leak") || lowerInput.includes("pani") || lowerInput.includes("water")) {
  service = "Plumber";
} else if (lowerInput.includes("electrician") || lowerInput.includes("short circuit") || lowerInput.includes("bijli") || lowerInput.includes("الیکٹریشن") || lowerInput.includes("board") || lowerInput.includes("fan") || lowerInput.includes("wire") || lowerInput.includes("pankha")) {
  service = "Electrician";
} else if (lowerInput.includes("tutor") || lowerInput.includes("parhana") || lowerInput.includes("teacher") || lowerInput.includes("ٹیوٹر") || lowerInput.includes("پڑھانا") || lowerInput.includes("study") || lowerInput.includes("math") || lowerInput.includes("physics")) {
  service = "Tutor";
} else if (lowerInput.includes("beautician") || lowerInput.includes("makeup") || lowerInput.includes("glow") || lowerInput.includes("بیوٹیشن") || lowerInput.includes("facial") || lowerInput.includes("salon")) {
  service = "Beautician";
} else if (lowerInput.includes("mechanic") || lowerInput.includes("car") || lowerInput.includes("gari") || lowerInput.includes("مکینک") || lowerInput.includes("motorcycle") || lowerInput.includes("bike") || lowerInput.includes("puncture") || lowerInput.includes("engine")) {
  service = "Mechanic";
} else {
  confidence = 0.5;
}

console.log("Service detected:", service);
console.log("Confidence:", confidence);
