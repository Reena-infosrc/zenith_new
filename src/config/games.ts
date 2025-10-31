import BeeGameImage from "@/components/Bee-game-FE.jpg";

export interface GameConfig {
  id: number;
  title: string;
  description: string;
  image: string;
  active?: boolean;
  defaultLeaderboard: Array<{
    name: string;
    score: number;
  }>;
}

// Function to generate dynamic leaderboard scores
const generateDynamicLeaderboard = () => {
  const names = [
    "James Lee", "Olivia Martin", "Lucas Garcia",
    "Emma Wilson", "Michael Chen", "Sarah Brown",
    "David Kim", "Amy Patel", "Ryan Johnson"
  ];
  
  // Create scores with some randomization
  return names.slice(0, 5).map(name => {
    return {
      name,
      // Generate random scores between 50-120 with preference for higher values
      score: Math.floor(50 + Math.random() * 70)
    };
  }).sort((a, b) => b.score - a.score); // Sort by highest score
};

export const generateBeeLeaderboard = () => {
  // Generate more consistent but still dynamic leaderboard
  return [
    { name: "Lucas Garcia", score: 113, date: new Date().toLocaleDateString() },
    { name: "James Lee", score: 99, date: new Date().toLocaleDateString() },
    { name: "Emma Wilson", score: 93, date: new Date().toLocaleDateString() },
    { name: "Olivia Martin", score: 87, date: new Date().toLocaleDateString() },
    { name: "Michael Chen", score: 84, date: new Date().toLocaleDateString() }
  ];
};

export const gamesConfig: Record<string, GameConfig> = {
  beeGame: {
    id: 1,
    title: "Bee Game",
    description: "Guide your bee over obstacles in this fun runner game",
    image: BeeGameImage,
    active: true,
    defaultLeaderboard: generateBeeLeaderboard()
  },
  teamTrivia: {
    id: 1,
    title: "Team Trivia",
    description: "Test your knowledge about company facts and industry trends",
    image: "https://images.unsplash.com/photo-1553481187-be93c21490a9?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    defaultLeaderboard: [
      { name: "Alex Johnson", score: 85 },
      { name: "Emma Wilson", score: 79 },
      { name: "Michael Chen", score: 72 },
    ]
  },
  wordPuzzle: {
    id: 2,
    title: "Word Puzzle",
    description: "Challenge your vocabulary with company-related word puzzles",
    image: "https://images.unsplash.com/photo-1606677661991-446cea8ee182?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    defaultLeaderboard: [
      { name: "Sarah Brown", score: 92 },
      { name: "David Kim", score: 88 },
      { name: "Alex Johnson", score: 75 },
    ]
  },
  memoryMatch: {
    id: 3,
    title: "Memory Match",
    description: "Test your memory by matching company products and services",
    image: "https://images.unsplash.com/photo-1611996575749-79a3a250f948?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    defaultLeaderboard: [
      { name: "Emma Wilson", score: 95 },
      { name: "Michael Chen", score: 90 },
      { name: "Sarah Brown", score: 82 },
    ]
  }
}; 