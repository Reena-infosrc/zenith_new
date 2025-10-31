import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Share2, MessageSquare, Star, ListOrdered, Clock, Award, GamepadIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BeeGame } from "./DinosaurGame";
import { BeeLeaderboard } from "./DinoLeaderboard";
import { gamesConfig, generateBeeLeaderboard } from "@/config/games";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function GameSection() {
  const [timer, setTimer] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [showBeeGame, setshowBeeGame] = useState(false);
  const [showBeeLeaderboard, setshowBeeLeaderboard] = useState(false);
  const { toast } = useToast();
  const [beeLeaderboard, setBeeLeaderboard] = useState(generateBeeLeaderboard());
  
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (isActive) {
      interval = setInterval(() => {
        setTimer(seconds => {
          if (seconds >= 899) {
            setIsActive(false);
            toast({
              title: "Time's up!",
              description: "You've been playing for 15 minutes. Time to get back to work!",
              variant: "destructive"
            });
            return 0;
          }
          return seconds + 1;
        });
      }, 1000);
    } else if (interval) {
      clearInterval(interval);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, toast]);

  // Initialize leaderboard once and subscribe to cross-tab updates
  useEffect(() => {
    try {
      const saved = localStorage.getItem('beeGameScores');
      if (saved) {
        const parsed = JSON.parse(saved);
        setBeeLeaderboard(parsed);
      } else {
        localStorage.setItem('beeGameScores', JSON.stringify(beeLeaderboard));
      }
    } catch (e) {
      console.error('Error initializing saved scores:', e);
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'beeGameScores' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          // Only update if different to avoid unnecessary renders
          if (JSON.stringify(parsed) !== JSON.stringify(beeLeaderboard)) {
            setBeeLeaderboard(parsed);
          }
        } catch (err) {
          console.error('Error parsing storage change scores:', err);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist leaderboard whenever it changes (same-tab)
  useEffect(() => {
    try {
      localStorage.setItem('beeGameScores', JSON.stringify(beeLeaderboard));
    } catch (e) {
      console.error('Error saving scores:', e);
    }
  }, [beeLeaderboard]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartGame = (gameType: string) => {
    setActiveGame(gameType);
    setIsActive(true);
    
    if (gameType === "Bee Game") {
      setshowBeeGame(true);
    } else {
      toast({
        title: `Starting ${gameType}`,
        description: "Timer started. You'll be reminded after 15 minutes."
      });
    }
  };

  const handleShareToFeed = (gameType: string) => {
    toast({
      title: "Shared to Feed",
      description: `You've shared your ${gameType} activity to the team feed!`
    });
  };

  const handleShowLeaderboard = (gameType: string) => {
    if (gameType === "Bee Game") {
      setshowBeeLeaderboard(true);
    } else {
      toast({
        title: `${gameType} Leaderboard`,
        description: "Viewing full leaderboard."
      });
    }
  };

  const game = gamesConfig.beeGame;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-lg border border-border mb-6">
        <div className="flex items-center space-x-4">
          <Clock className="text-primary" size={24} />
          <div>
            <h3 className="text-lg font-medium">Session Timer</h3>
            <p className="text-muted-foreground text-sm">Time spent gaming</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="text-2xl font-bold">{formatTime(timer)}</div>
          <Button 
            variant={isActive ? "destructive" : "default"} 
            size="sm" 
            onClick={() => setIsActive(!isActive)}
          >
            {isActive ? "Pause" : "Resume"}
          </Button>
        </div>
      </div>
      
      <div className="max-w-2xl mx-auto">
        <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 border-border">
          <div className="aspect-video w-full overflow-hidden">
            <img 
              src={game.image} 
              alt={game.title} 
              className="w-full h-full object-cover transition-transform hover:scale-105 duration-500"
            />
          </div>
          
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>{game.title}</CardTitle>
                <CardDescription>{game.description}</CardDescription>
              </div>
              <Badge variant="outline" className="flex items-center gap-1">
                <Award size={14} />
                <span>{game.active ? "Active" : "Active"}</span>
              </Badge>
            </div>
          </CardHeader>
          
          <CardContent>
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                <ListOrdered size={16} />
                <span>Leaderboard</span>
              </h4>
              <div className="space-y-2">
                {beeLeaderboard.slice(0, 3).map((leader, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      {idx === 0 && <Star className="text-amber-500" size={16} />}
                      <span>{leader.name}</span>
                    </div>
                    <span className="font-medium">{leader.score} pts</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
          
          <CardFooter className="flex justify-between border-t border-border pt-4">
            <Dialog open={showBeeGame} onOpenChange={setshowBeeGame}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => handleStartGame(game.title)}>
                  <GamepadIcon className="mr-1 h-4 w-4" />
                  Play Now
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-3xl w-[90vw]">
                <DialogHeader>
                  <DialogTitle>{game.title}</DialogTitle>
                  <DialogDescription>
                    Guide your bee over obstacles and set a high score!
                  </DialogDescription>
                </DialogHeader>
                <BeeGame />
              </DialogContent>
            </Dialog>
            
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="icon" onClick={() => handleShareToFeed(game.title)}>
                <MessageSquare size={18} />
              </Button>
              <Button variant="ghost" size="icon">
                <Share2 size={18} />
              </Button>
              <Dialog open={showBeeLeaderboard} onOpenChange={setshowBeeLeaderboard}>
                <DialogTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => handleShowLeaderboard(game.title)}
                  >
                    <ListOrdered size={18} />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Bee Game Leaderboard</DialogTitle>
                    <DialogDescription>
                      Top scores from all players
                    </DialogDescription>
                  </DialogHeader>
                  <BeeLeaderboard />
                </DialogContent>
              </Dialog>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
