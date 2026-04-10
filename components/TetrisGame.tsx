"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;
const TARGET_LINES = 3;

const COLORS: { [key: string]: string } = {
  I: "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]",
  O: "bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.8)]",
  T: "bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.8)]",
  S: "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]",
  Z: "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]",
  J: "bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.8)]",
  L: "bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.8)]",
};

const SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
};

type GameState = "START" | "PLAYING" | "PAUSED" | "WON" | "GAMEOVER";
type Piece = { pos: { x: number; y: number }; shape: number[][]; type: keyof typeof SHAPES };
type LeaderboardEntry = { name: string; finishtime: string };

const createEmptyGrid = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const TetrisGame = () => {
  const [gameState, setGameState] = useState<GameState>("START");
  const [userName, setUserName] = useState("");
  const [grid, setGrid] = useState<(string | null)[][]>(createEmptyGrid());
  const [activePiece, setActivePiece] = useState<Piece | null>(null);
  const [linesCleared, setLinesCleared] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  const [clearingRows, setClearingRows] = useState<number[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<"flashing" | "shattering" | null>(null);

  const gameLoopRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchTop3 = async () => {
    setLoadingLeaderboard(true);
    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      if (data.success && data.data) {
        const sorted = data.data
          .filter((entry: any) => (entry.time || entry.finishtime) && (entry.time || entry.finishtime).includes(':'))
          .map((entry: any) => ({
            name: entry.name,
            finishtime: entry.finishtime || entry.time
          }))
          .sort((a: any, b: any) => {
            const timeA = a.finishtime.split(':').map(Number).reduce((acc: number, val: number) => acc * 60 + val, 0);
            const timeB = b.finishtime.split(':').map(Number).reduce((acc: number, val: number) => acc * 60 + val, 0);
            return timeA - timeB;
          }).slice(0, 3);
        setLeaderboard(sorted);
      }
    } catch (err) {
      console.error("Leaderboard fetch failed", err);
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  const saveScore = async (finalTime: string) => {
    try {
      await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: userName, time: finalTime }),
      });
      setTimeout(fetchTop3, 500);
    } catch (err) {
      console.error("Score save failed", err);
    }
  };

  const spawnPiece = useCallback(() => {
    const types = Object.keys(SHAPES) as (keyof typeof SHAPES)[];
    const type = types[Math.floor(Math.random() * types.length)];
    const shape = SHAPES[type];
    const newPiece = {
      pos: { x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 },
      shape,
      type,
    };

    if (checkCollision(newPiece.pos, newPiece.shape, grid)) {
      setGameState("GAMEOVER");
      return null;
    }
    return newPiece;
  }, [grid]);

  const checkCollision = (pos: { x: number; y: number }, shape: number[][], currentGrid: (string | null)[][]) => {
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (shape[y][x]) {
          const newX = pos.x + x;
          const newY = pos.y + y;
          if (newX < 0 || newX >= COLS || newY >= ROWS || (newY >= 0 && currentGrid[newY][newX])) {
            return true;
          }
        }
      }
    }
    return false;
  };

  const rotate = (shape: number[][]) => {
    return shape[0].map((_, i) => shape.map((row) => row[i]).reverse());
  };

  const hasSaved = useRef(false);
  const isProcessingLock = useRef(false);

  useEffect(() => {
    if (linesCleared >= TARGET_LINES && gameState === "PLAYING" && !hasSaved.current) {
      setGameState("WON");
      hasSaved.current = true;
      saveScore(formatTime(seconds));
    }
  }, [linesCleared, gameState]);

  const handleLineClear = (fullRows: number[]) => {
    const localLinesCleared = fullRows.length;
    
    setGrid((prevGrid) => {
      const newGrid = prevGrid.map((row) => [...row]);
      const filteredGrid = newGrid.filter((_, i) => !fullRows.includes(i));
      while (filteredGrid.length < ROWS) {
        filteredGrid.unshift(Array(COLS).fill(null));
      }
      return filteredGrid;
    });

    setLinesCleared((prev) => prev + localLinesCleared);

    if (linesCleared + localLinesCleared < TARGET_LINES) {
      setActivePiece(spawnPiece());
    }
  };

  const lockPiece = () => {
    if (!activePiece || isAnimating || isProcessingLock.current) return;
    isProcessingLock.current = true;

    setGrid((prevGrid) => {
      const newGrid = prevGrid.map((row) => [...row]);
      activePiece.shape.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value) {
            const newY = activePiece.pos.y + y;
            const newX = activePiece.pos.x + x;
            if (newY >= 0) newGrid[newY][newX] = activePiece.type;
          }
        });
      });

      const fullRows: number[] = [];
      newGrid.forEach((row, i) => {
        if (row.every((cell) => cell !== null)) {
          fullRows.push(i);
        }
      });

      if (fullRows.length > 0) {
        setIsAnimating(true);
        setClearingRows(fullRows);
        setAnimationPhase("flashing");
        setActivePiece(null);
        
        setTimeout(() => setAnimationPhase("shattering"), 1000);
        setTimeout(() => {
          handleLineClear(fullRows);
          setIsAnimating(false);
          setClearingRows([]);
          setAnimationPhase(null);
          isProcessingLock.current = false;
        }, 2500);
        
        return newGrid;
      }

      setActivePiece(spawnPiece());
      isProcessingLock.current = false;
      return newGrid;
    });
  };

  const move = useCallback((dir: { x: number; y: number }) => {
    if (gameState !== "PLAYING" || isAnimating) return;

    setActivePiece((prev) => {
      if (!prev) return prev;
      const newPos = { x: prev.pos.x + dir.x, y: prev.pos.y + dir.y };
      if (!checkCollision(newPos, prev.shape, grid)) {
        return { ...prev, pos: newPos };
      } else if (dir.y > 0) {
        lockPiece();
      }
      return prev;
    });
  }, [gameState, grid, lockPiece]);

  const handleRotate = () => {
    if (gameState !== "PLAYING" || !activePiece || isAnimating) return;
    const rotatedShape = rotate(activePiece.shape);
    if (!checkCollision(activePiece.pos, rotatedShape, grid)) {
      setActivePiece({ ...activePiece, shape: rotatedShape });
    }
  };

  // Keyboard Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== "PLAYING") return;
      if (e.key === "ArrowLeft") move({ x: -1, y: 0 });
      if (e.key === "ArrowRight") move({ x: 1, y: 0 });
      if (e.key === "ArrowDown") move({ x: 0, y: 1 });
      if (e.key === " ") handleRotate();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState, activePiece, grid, move]);

  // Timer
  useEffect(() => {
    if (gameState === "PLAYING") {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState]);

  // Game Loop
  useEffect(() => {
    if (gameState === "PLAYING") {
      gameLoopRef.current = setInterval(() => move({ x: 0, y: 1 }), 800);
    } else {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    }
    return () => { if (gameLoopRef.current) clearInterval(gameLoopRef.current); };
  }, [gameState, move]);

  const startGame = () => {
    if (!userName.trim()) return alert("이름을 입력해주세요!");
    setGrid(createEmptyGrid());
    setLinesCleared(0);
    setSeconds(0);
    setGameState("PLAYING");
    setActivePiece(spawnPiece());
    hasSaved.current = false;
    isProcessingLock.current = false;
  };

  const resetToStart = () => {
    setGameState("START");
    setUserName("");
    setGrid(createEmptyGrid());
    setLinesCleared(0);
    setSeconds(0);
    setActivePiece(null);
    hasSaved.current = false;
    isProcessingLock.current = false;
  };

  const togglePause = () => {
    if (gameState === "PLAYING") setGameState("PAUSED");
    else if (gameState === "PAUSED") setGameState("PLAYING");
  };

  if (gameState === "START") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-900 p-6">
        <div className="w-full max-w-md bg-white p-10 rounded-2xl shadow-xl border border-slate-200 text-center space-y-8">
          <h1 className="text-5xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-indigo-500 to-cyan-500 mb-2">
            TETRIS
          </h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">클래식 테트리스</p>
          
          <div className="space-y-4">
            <input
              type="text"
              placeholder="사용자 이름을 입력하세요"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-xl text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-lg text-slate-900"
            />
            <button
              onClick={startGame}
              className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-xl hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-100"
            >
              게임 시작
            </button>
          </div>
        </div>

        <div className="absolute bottom-8 text-slate-400 text-sm space-y-1 font-medium text-center">
          <p>AI코딩을활용한창의적앱개발, 세무회계학과, 오예림</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-900 p-4 font-sans">
      <style jsx global>{`
        @keyframes flash {
          0%, 100% { opacity: 1; filter: brightness(1); }
          50% { opacity: 0.3; filter: brightness(2); }
        }
        @keyframes shatter {
          0% { transform: scale(1) rotate(0deg); opacity: 1; }
          100% { transform: scale(0) rotate(45deg); opacity: 0; }
        }
        .flash-anim {
          animation: flash 0.2s infinite;
        }
        .shatter-anim {
          animation: shatter 1.5s forwards;
        }
      `}</style>
      <div className="flex flex-col lg:flex-row gap-8 bg-white p-8 rounded-2xl border border-slate-200 shadow-2xl relative">
        
        {/* Play Area */}
        <div 
          className="grid bg-slate-50 border-4 border-slate-200 rounded-lg overflow-hidden relative shadow-inner"
          style={{ gridTemplateColumns: `repeat(${COLS}, ${BLOCK_SIZE}px)`, gridTemplateRows: `repeat(${ROWS}, ${BLOCK_SIZE}px)` }}
        >
          {grid.map((row, y) =>
            row.map((cell, x) => {
              let colorClass = "bg-transparent";
              if (cell) colorClass = COLORS[cell];
              if (activePiece) {
                const pieceY = y - activePiece.pos.y;
                const pieceX = x - activePiece.pos.x;
                if (activePiece.shape[pieceY]?.[pieceX]) colorClass = COLORS[activePiece.type];
              }

              const isClearing = clearingRows.includes(y);
              let animationClass = "";
              if (isClearing) {
                if (animationPhase === "flashing") animationClass = "flash-anim";
                else if (animationPhase === "shattering") animationClass = "shatter-anim";
              }
              
              return (
                <div 
                  key={`${x}-${y}`} 
                  className={`border-[0.5px] border-slate-200/30 ${colorClass} ${animationClass}`} 
                  style={{ width: BLOCK_SIZE, height: BLOCK_SIZE }} 
                />
              );
            })
          )}

          {/* Overlays */}
          {(gameState === "WON" || gameState === "GAMEOVER") && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 backdrop-blur-md p-6 text-center">
              <h2 className={`text-5xl font-black mb-2 ${gameState === "WON" ? "text-indigo-600" : "text-red-500"}`}>
                {gameState === "WON" ? "게임 완료!" : "게임 오버"}
              </h2>
              <p className="text-xl font-bold mb-6 italic text-slate-500">시간: {formatTime(seconds)}</p>
              
              <div className="w-full mb-8 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="text-sm font-black text-indigo-500 uppercase mb-3 tracking-widest">TOP 3 명예의 전당</h3>
                {loadingLeaderboard ? <p className="text-xs animate-pulse text-slate-400">불러오는 중...</p> : (
                  <div className="space-y-2 text-slate-900">
                    {leaderboard.length > 0 ? leaderboard.map((entry, i) => (
                      <div key={i} className="flex justify-between text-sm py-1 border-b border-slate-200">
                        <span className="text-slate-600">{i+1}. {entry.name}</span>
                        <span className="font-mono text-indigo-600 font-bold">{entry.finishtime}</span>
                      </div>
                    )) : <p className="text-xs text-slate-400">데이터가 없습니다.</p>}
                  </div>
                )}
              </div>

              <button
                onClick={resetToStart}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black hover:bg-indigo-700 transition-colors active:scale-95 shadow-lg shadow-indigo-100"
              >
                다시 시작 (이름 화면)
              </button>
            </div>
          )}

          {gameState === "PAUSED" && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[2px]">
              <div className="bg-white p-6 rounded-2xl border border-indigo-200 shadow-2xl">
                <p className="text-2xl font-black text-indigo-600 mb-4 tracking-tighter">일시 정지</p>
                <button onClick={togglePause} className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold shadow-lg shadow-indigo-100">계속하기</button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-48 flex flex-col justify-between">
          <div className="space-y-6 text-center lg:text-left">
            <div>
              <h2 className="text-xs uppercase tracking-[0.3em] font-black text-indigo-500 mb-1">Status</h2>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <p className="text-xs text-slate-400 uppercase font-bold">Player</p>
                <p className="text-lg font-black truncate text-slate-900">{userName}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 text-slate-900">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <p className="text-xs text-slate-400 uppercase font-bold mb-1">Time</p>
                <p className="text-3xl font-mono text-indigo-600 font-black">{formatTime(seconds)}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 relative overflow-hidden">
                <p className="text-xs text-slate-400 uppercase font-bold mb-1">Lines</p>
                <div className="flex items-end gap-1">
                  <p className="text-3xl font-mono text-rose-500 font-black">{linesCleared}</p>
                  <p className="text-sm text-slate-400 pb-1">/ {TARGET_LINES}</p>
                </div>
                {/* Progress bar */}
                <div className="absolute bottom-0 left-0 h-1 bg-rose-500/30" style={{ width: `${(linesCleared/TARGET_LINES)*100}%` }}></div>
              </div>
            </div>

            <div className="space-y-2 pt-4">
              <button 
                onClick={togglePause}
                className="w-full py-3 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-sm border border-slate-200 transition-all active:scale-95 shadow-sm"
              >
                {gameState === "PAUSED" ? "계속" : "일시정지"}
              </button>
              <button 
                onClick={startGame}
                className="w-full py-3 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-sm border border-slate-200 transition-all active:scale-95 shadow-sm"
              >
                재시작
              </button>
              <button 
                onClick={() => { if(confirm("게임을 종료하시겠습니까?")) resetToStart(); }}
                className="w-full py-3 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl font-bold text-sm border border-rose-200 transition-all active:scale-95"
              >
                종료하기
              </button>
            </div>
          </div>

          <div className="mt-8 text-[10px] text-slate-400 uppercase font-black tracking-widest leading-relaxed">
            <p>Creative App Dev</p>
            <p>Incheon National Univ</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TetrisGame;
