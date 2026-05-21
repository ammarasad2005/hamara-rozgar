export const mockProviders = [
  {
    id: "p1",
    name: "Ali AC Services",
    specialization: "AC Technician",
    baseRate: 1500, // PKR
    rating: 4.8,
    reliabilityScore: 96, // %
    cancellationRate: 3, // %
    availability: ["10:00 AM", "12:00 PM", "3:00 PM", "5:00 PM"],
    location: "G-13",
    latitude: 33.6409,
    longitude: 72.9814,
    phone: "+92 300 1234567",
    experienceYears: 8,
    toolsProvided: true,
    certifications: ["DAE HVAC certified"],
    reviews: [
      { user: "Hamza", rating: 5, comment: "Bhai ne bohat acha AC repair kia, price bhi reasonable thi.", date: "2026-05-18" },
      { user: "Aisha", rating: 4, comment: "On time arrival and clean work.", date: "2026-05-19" }
    ]
  },
  {
    id: "p2",
    name: "Khan Electric Works",
    specialization: "Electrician",
    baseRate: 1200,
    rating: 4.7,
    reliabilityScore: 98,
    cancellationRate: 1,
    availability: ["09:00 AM", "11:00 AM", "2:00 PM", "4:00 PM"],
    location: "F-10",
    latitude: 33.6934,
    longitude: 73.0076,
    phone: "+92 312 9876543",
    experienceYears: 12,
    toolsProvided: true,
    certifications: ["Licensed Electrician"],
    reviews: [
      { user: "Usman", rating: 5, comment: "Short circuit solve krne me expert hain.", date: "2026-05-15" }
    ]
  },
  {
    id: "p3",
    name: "Zahid Plumbing & Boring",
    specialization: "Plumber",
    baseRate: 1000,
    rating: 4.5,
    reliabilityScore: 92,
    cancellationRate: 5,
    availability: ["11:00 AM", "1:00 PM", "4:00 PM", "6:00 PM"],
    location: "I-8",
    latitude: 33.6698,
    longitude: 73.0747,
    phone: "+92 333 4567890",
    experienceYears: 6,
    toolsProvided: true,
    certifications: [],
    reviews: [
      { user: "Sana", rating: 4, comment: "Leakage repair successfully done.", date: "2026-05-17" }
    ]
  },
  {
    id: "p4",
    name: "Dr. Maria Academic Academy",
    specialization: "Tutor",
    baseRate: 2000,
    rating: 4.9,
    reliabilityScore: 99,
    cancellationRate: 0,
    availability: ["03:00 PM", "05:00 PM", "07:00 PM"],
    location: "G-11",
    latitude: 33.6644,
    longitude: 72.9998,
    phone: "+92 345 5678901",
    experienceYears: 10,
    toolsProvided: false,
    certifications: ["PhD in Physics"],
    reviews: [
      { user: "Bilal", rating: 5, comment: "Best math and physics teacher in town.", date: "2026-05-10" }
    ]
  },
  {
    id: "p5",
    name: "Glow & Style Beautician (Home Service)",
    specialization: "Beautician",
    baseRate: 2500,
    rating: 4.6,
    reliabilityScore: 94,
    cancellationRate: 4,
    availability: ["10:00 AM", "1:00 PM", "4:00 PM", "7:00 PM"],
    location: "E-11",
    latitude: 33.6998,
    longitude: 72.9734,
    phone: "+92 321 6789012",
    experienceYears: 5,
    toolsProvided: true,
    certifications: ["CIDESCO Diploma"],
    reviews: [
      { user: "Zara", rating: 5, comment: "Excellent party makeup service at home!", date: "2026-05-16" }
    ]
  },
  {
    id: "p6",
    name: "Islamabad Auto Experts",
    specialization: "Mechanic",
    baseRate: 3000,
    rating: 4.7,
    reliabilityScore: 95,
    cancellationRate: 2,
    availability: ["08:00 AM", "12:00 PM", "3:00 PM"],
    location: "G-13",
    latitude: 33.6425,
    longitude: 72.9840,
    phone: "+92 301 2345678",
    experienceYears: 15,
    toolsProvided: true,
    certifications: ["EFI Auto Specialist"],
    reviews: [
      { user: "Ahmed", rating: 5, comment: "Car diagnostics machine with them. Resolved engine warning light.", date: "2026-05-20" }
    ]
  },
  {
    id: "p7",
    name: "Sajid AC Repairs (Low Cost)",
    specialization: "AC Technician",
    baseRate: 900,
    rating: 4.1,
    reliabilityScore: 85,
    cancellationRate: 10,
    availability: ["01:00 PM", "03:00 PM", "06:00 PM"],
    location: "I-8",
    latitude: 33.6650,
    longitude: 73.0720,
    phone: "+92 334 1122334",
    experienceYears: 3,
    toolsProvided: true,
    certifications: [],
    reviews: [
      { user: "Kamran", rating: 4, comment: "Kaam thik tha par late aaye high traffic ki wajah se.", date: "2026-05-18" }
    ]
  }
];

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
