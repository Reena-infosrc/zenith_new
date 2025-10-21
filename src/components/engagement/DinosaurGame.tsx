import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { generateBeeLeaderboard } from "@/config/games";

// Use the absolute path for the image
const beeImagePath = "/Users/jagadeeshlakshminarasimhan/Documents/Zenith/zenith-hr-pulse/src/components/HoneyBee.png";

interface PlayerStats {
  name: string;
  score: number;
  date: string;
}

export function BeeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [highScores, setHighScores] = useState<PlayerStats[]>([]);
  const [beeImage, setBeeImage] = useState<HTMLImageElement | null>(null);
  
  // Game variables
  const gameRef = useRef<{
    bee: {
      x: number;
      y: number;
      width: number;
      height: number;
      jumping: boolean;
      jumpHeight: number;
      gravity: number;
      velocityY: number;
      frameCount: number;
    };
    obstacles: {
      x: number;
      y: number;
      width: number;
      height: number;
      type: string;
      passed: boolean;
    }[];
    clouds: {
      x: number;
      y: number;
      speed: number;
    }[];
    ground: {
      y: number;
    };
    gameSpeed: number;
    frameCount: number;
    animationFrame: number | null;
    nightMode: boolean;
    currentScore: number;
    lastSpeedIncrease: number;
  }>({
    bee: {
      x: 50,
      y: 0,
      width: 40,
      height: 40,
      jumping: false,
      jumpHeight: 15,
      gravity: 0.8,
      velocityY: 0,
      frameCount: 0,
    },
    obstacles: [],
    clouds: [],
    ground: {
      y: 0,
    },
    gameSpeed: 5,
    frameCount: 0,
    animationFrame: null,
    nightMode: false,
    currentScore: 0,
    lastSpeedIncrease: 0,
  });

  // Initialize the game
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to fit container
    canvas.width = canvas.offsetWidth;
    canvas.height = 280;
    
    // Set ground position
    gameRef.current.ground.y = canvas.height - 30;
    
    // Set initial bee position
    gameRef.current.bee.y = gameRef.current.ground.y - gameRef.current.bee.height;

    // Initialize clouds
    for (let i = 0; i < 3; i++) {
      gameRef.current.clouds.push({
        x: canvas.width + (i * canvas.width / 3),
        y: 50 + Math.random() * 60,
        speed: 1 + Math.random() * 0.5,
      });
    }

    // Load high scores from localStorage
    const savedScores = localStorage.getItem('beeGameScores');
    if (savedScores) {
      try {
        setHighScores(JSON.parse(savedScores));
      } catch (e) {
        // Use our shared leaderboard if there's an error
        const defaultScores = generateBeeLeaderboard();
        setHighScores(defaultScores);
      }
    } else {
      // Use the shared default leaderboard if no scores exist
      const defaultScores = generateBeeLeaderboard();
      setHighScores(defaultScores);
      localStorage.setItem('beeGameScores', JSON.stringify(defaultScores));
    }

    // Load bee image
    const img = new Image();
    img.src = '/HoneyBee.png'; // Reference from public directory
    img.onload = () => {
      setBeeImage(img);
    };
    img.onerror = (e) => {
    };

    // Draw the initial scene
    drawGame();

    // Add event listener for jumping
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameStarted && !gameOver && (e.key === " " || e.key === "ArrowUp")) {
        // Only jump if game is active
        e.preventDefault(); // Prevent spacebar from triggering button clicks
        jump();
      } else if (!gameStarted && !gameOver && e.key === " ") {
        // Start game if not started
        e.preventDefault();
        startGame();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      const currentGameRef = gameRef.current;
      if (currentGameRef?.animationFrame) {
        cancelAnimationFrame(currentGameRef.animationFrame);
      }
    };
  }, [gameStarted, gameOver, drawGame, startGame]);

  // Game loop
  const updateGame = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    
    // Update frame count
    gameRef.current.frameCount++;
    gameRef.current.bee.frameCount++;
    
    // Switch between day and night mode occasionally
    if (gameRef.current.frameCount % 1000 === 0) {
      gameRef.current.nightMode = !gameRef.current.nightMode;
    }
    
    // Update bee position
    if (gameRef.current.bee.jumping) {
      gameRef.current.bee.velocityY += gameRef.current.bee.gravity;
      gameRef.current.bee.y += gameRef.current.bee.velocityY;
      
      // Check if bee has landed
      if (gameRef.current.bee.y >= gameRef.current.ground.y - gameRef.current.bee.height) {
        gameRef.current.bee.y = gameRef.current.ground.y - gameRef.current.bee.height;
        gameRef.current.bee.jumping = false;
        gameRef.current.bee.velocityY = 0;
      }
    }
    
    // Update clouds
    gameRef.current.clouds.forEach(cloud => {
      cloud.x -= cloud.speed;
      if (cloud.x < -60) {
        cloud.x = canvas.width + 60;
        cloud.y = 50 + Math.random() * 60;
      }
    });
    
    // Generate obstacles
    if (gameRef.current.frameCount % 40 === 0 && Math.random() > 0.5) {
      const type = Math.random() > 0.5 ? 'small' : 'large';
      const width = type === 'small' ? 20 : 30;
      const height = type === 'small' ? 40 : 60;
      
      gameRef.current.obstacles.push({
        x: canvas.width,
        y: gameRef.current.ground.y - height,
        width,
        height,
        type,
        passed: false
      });
    }
    
    // Update obstacles position
    for (let i = 0; i < gameRef.current.obstacles.length; i++) {
      const obstacle = gameRef.current.obstacles[i];
      obstacle.x -= gameRef.current.gameSpeed;
      
      // Check if bee has passed obstacle
      if (!obstacle.passed && obstacle.x + obstacle.width < gameRef.current.bee.x) {
        obstacle.passed = true;
        
        // Update internal score immediately
        gameRef.current.currentScore += 1;
        
        // And update React state (this will be slower)
        setScore(gameRef.current.currentScore);
        
        // Increase speed every 10 points
        if (gameRef.current.currentScore % 10 === 0 && gameRef.current.currentScore > gameRef.current.lastSpeedIncrease) {
          gameRef.current.gameSpeed *= 1.14;
          gameRef.current.lastSpeedIncrease = gameRef.current.currentScore;
        }
      }
      
      // Remove obstacles that are off-screen
      if (obstacle.x + obstacle.width < 0) {
        gameRef.current.obstacles.splice(i, 1);
        i--;
      }
      
      // Collision detection - make the hitbox slightly smaller than visual for better gameplay
      const hitboxReduction = 10;
      if (
        gameRef.current.bee.x + hitboxReduction < obstacle.x + obstacle.width - hitboxReduction &&
        gameRef.current.bee.x + gameRef.current.bee.width - hitboxReduction > obstacle.x + hitboxReduction &&
        gameRef.current.bee.y + hitboxReduction < obstacle.y + obstacle.height - hitboxReduction &&
        gameRef.current.bee.y + gameRef.current.bee.height - hitboxReduction > obstacle.y + hitboxReduction
      ) {
        handleGameOver();
        return;
      }
    }
    
    // Draw the updated game
    drawGame();
    
    // Continue the game loop
    gameRef.current.animationFrame = requestAnimationFrame(updateGame);
  };

  // Draw the game
  const drawGame = () => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    // Clear canvas with sky blue background
    ctx.fillStyle = gameRef.current.nightMode ? "#1a1a4f" : "#87CEEB";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw clouds
    ctx.fillStyle = "#ffffff";
    gameRef.current.clouds.forEach(cloud => {
      ctx.beginPath();
      ctx.arc(cloud.x, cloud.y, 15, 0, Math.PI * 2);
      ctx.arc(cloud.x + 15, cloud.y - 10, 12, 0, Math.PI * 2);
      ctx.arc(cloud.x + 25, cloud.y, 15, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // Draw ground with green grass
    ctx.fillStyle = gameRef.current.nightMode ? "#005500" : "#00AA00";
    ctx.fillRect(0, gameRef.current.ground.y, canvas.width, 20);
    ctx.fillStyle = gameRef.current.nightMode ? "#003300" : "#008800";
    ctx.fillRect(0, gameRef.current.ground.y, canvas.width, 2);
    
    // Draw bee - either image if loaded or fallback to drawn bee
    if (beeImage && beeImage.complete) {
      ctx.save();
      if (gameOver) {
        // Add red tint for game over
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
        ctx.fillRect(
          gameRef.current.bee.x,
          gameRef.current.bee.y,
          gameRef.current.bee.width,
          gameRef.current.bee.height
        );
      }
      
      // Draw with slight rotation based on velocity for flying effect
      const rotation = gameRef.current.bee.velocityY * 0.05;
      ctx.translate(
        gameRef.current.bee.x + gameRef.current.bee.width / 2,
        gameRef.current.bee.y + gameRef.current.bee.height / 2
      );
      ctx.rotate(rotation);
      ctx.drawImage(
        beeImage,
        -gameRef.current.bee.width / 2,
        -gameRef.current.bee.height / 2,
        gameRef.current.bee.width,
        gameRef.current.bee.height
      );
      ctx.restore();
    } else {
      // Fallback to drawn bee if image not loaded
      drawBee(ctx, gameOver);
    }
    
    // Draw obstacles as flowers
    gameRef.current.obstacles.forEach(obstacle => {
      drawFlower(ctx, obstacle);
    });
    
    // Draw score
    ctx.fillStyle = gameRef.current.nightMode ? "#ffffff" : "#000000";
    ctx.font = "bold 20px monospace";
    ctx.fillText(`Score: ${gameRef.current.currentScore}`, 20, 30);
  };

  // Draw the bee
  const drawBee = (ctx: CanvasRenderingContext2D, isDead: boolean) => {
    const bee = gameRef.current.bee;
    
    // Body
    ctx.fillStyle = "#FFCC00"; // Yellow body
    ctx.beginPath();
    ctx.ellipse(
      bee.x + bee.width/2, 
      bee.y + bee.height/2,
      bee.width/2,
      bee.height/2,
      0, 0, Math.PI * 2
    );
    ctx.fill();
    
    // Stripes
    ctx.fillStyle = "#000000";
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(
        bee.x + bee.width * (0.3 + i * 0.2), 
        bee.y + bee.height * 0.2,
        bee.width * 0.1,
        bee.height * 0.6
      );
    }
    
    // Wings (white) - animated
    ctx.fillStyle = "#FFFFFF";
    const wingPosition = Math.sin(bee.frameCount * 0.5) * 0.2;
    
    // Left wing
    ctx.beginPath();
    ctx.ellipse(
      bee.x + bee.width * 0.3, 
      bee.y + bee.height * (0.3 + wingPosition),
      bee.width * 0.3,
      bee.height * 0.2,
      Math.PI * 0.2, 0, Math.PI * 2
    );
    ctx.fill();
    
    // Eyes
    if (isDead) {
      // X eyes when dead
      ctx.strokeStyle = "red";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bee.x + bee.width * 0.7, bee.y + bee.height * 0.3);
      ctx.lineTo(bee.x + bee.width * 0.9, bee.y + bee.height * 0.5);
      ctx.moveTo(bee.x + bee.width * 0.9, bee.y + bee.height * 0.3);
      ctx.lineTo(bee.x + bee.width * 0.7, bee.y + bee.height * 0.5);
      ctx.stroke();
    } else {
      // Regular eye
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(
        bee.x + bee.width * 0.8, 
        bee.y + bee.height * 0.4,
        3, 0, Math.PI * 2
      );
      ctx.fill();
    }
    
    // Add antennae to make it look more like a bee
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bee.x + bee.width * 0.7, bee.y + bee.height * 0.2);
    ctx.lineTo(bee.x + bee.width * 0.8, bee.y);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(bee.x + bee.width * 0.9, bee.y + bee.height * 0.2);
    ctx.lineTo(bee.x + bee.width * 1.0, bee.y);
    ctx.stroke();
  };

  // Add a function to draw flowers instead of cacti
  const drawFlower = (ctx: CanvasRenderingContext2D, obstacle: { x: number; y: number; width: number; height: number; type: string }) => {
    const flowerColor = obstacle.type === 'small' ? "#FF44FF" : "#FF88FF"; // Pink flowers
    const centerColor = "#FFFF00"; // Yellow center
    
    // Draw stem
    ctx.fillStyle = "#00AA00";
    ctx.fillRect(
      obstacle.x + obstacle.width/2 - 3, 
      obstacle.y + obstacle.height/3, 
      6, 
      obstacle.height*2/3
    );
    
    // Draw flower petals
    ctx.fillStyle = flowerColor;
    const centerX = obstacle.x + obstacle.width/2;
    const centerY = obstacle.y + obstacle.height/4;
    const petalSize = obstacle.type === 'small' ? 10 : 15;
    
    // Draw 5 petals
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(
        centerX + Math.cos(angle) * petalSize,
        centerY + Math.sin(angle) * petalSize,
        petalSize, 0, Math.PI * 2
      );
      ctx.fill();
    }
    
    // Draw center of flower
    ctx.fillStyle = centerColor;
    ctx.beginPath();
    ctx.arc(centerX, centerY, petalSize/2, 0, Math.PI * 2);
    ctx.fill();
  };

  // Jump function
  const jump = () => {
    if (!gameRef.current.bee.jumping) {
      gameRef.current.bee.jumping = true;
      gameRef.current.bee.velocityY = -gameRef.current.bee.jumpHeight;
    }
  };

  // Start game
  const startGame = () => {
    // Reset game state
    setScore(0);
    gameRef.current.currentScore = 0;
    setGameOver(false);
    gameRef.current.obstacles = [];
    gameRef.current.frameCount = 0;
    gameRef.current.gameSpeed = 5;
    gameRef.current.bee.y = gameRef.current.ground.y - gameRef.current.bee.height;
    gameRef.current.nightMode = false;
    gameRef.current.lastSpeedIncrease = 0;
    
    // Start the game loop
    gameRef.current.animationFrame = requestAnimationFrame(updateGame);
    setGameStarted(true);
    
    // Focus canvas for keyboard events
    if (canvasRef.current) {
      canvasRef.current.focus();
    }
  };

  // Handle game over
  const handleGameOver = () => {
    if (gameRef.current.animationFrame) {
      cancelAnimationFrame(gameRef.current.animationFrame);
    }
    
    setGameOver(true);
    setGameStarted(false);
    
    // Update high scores
    const newScore: PlayerStats = {
      name: "You", // In a real app, this would be the user's name
      score: gameRef.current.currentScore,
      date: new Date().toLocaleDateString()
    };
    
    const newHighScores = [...highScores, newScore]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    
    setHighScores(newHighScores);
    
    // Save to localStorage
    localStorage.setItem('beeGameScores', JSON.stringify(newHighScores));
    
    // Draw final game state
    drawGame();
  };

  const handleCanvasTap = () => {
    if (gameStarted && !gameOver) {
      // Only jump if game is active
      jump();
    } else if (!gameStarted && !gameOver) {
      // Start game if not started and not game over
      startGame();
    } else if (gameOver) {
      // Restart if game over
      startGame();
    }
  };

  return (
    <div className="w-full">
      <div 
        className="w-full relative mb-4"
        onClick={handleCanvasTap}
      >
        <canvas 
          ref={canvasRef} 
          className="w-full h-auto border border-border rounded-md bg-white dark:bg-gray-900"
          tabIndex={0}
        ></canvas>
        
        {!gameStarted && !gameOver && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Button size="lg" onClick={startGame} className="px-6 py-6 text-lg">
              Start Game
            </Button>
          </div>
        )}
        
        {gameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="bg-background p-6 rounded-md text-center shadow-lg">
              <h3 className="text-2xl font-bold mb-2">Game Over</h3>
              <p className="mb-2 text-lg">Your score: <span className="font-bold">{score}</span></p>
              <Button size="lg" onClick={startGame} className="mt-4">Play Again</Button>
            </div>
          </div>
        )}
      </div>
      
      <div className="text-center text-sm text-muted-foreground">
        <p>Press SPACE or TAP to make the bee fly over flowers</p>
      </div>
    </div>
  );
} 