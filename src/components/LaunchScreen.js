import React, { useState, useEffect, useCallback } from 'react';
import './LaunchScreen.css';

const LaunchScreen = ({ onLaunch }) => {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [systemReady, setSystemReady] = useState(true);
  const [terminalLines, setTerminalLines] = useState([]);

  // Boot sequence steps with their text and duration (in ms)
  const bootSequence = [
    { text: "Initializing SOLidify platform...", duration: 1000 },
    { text: "Connecting to Solana devnet...", duration: 1500 },
    { text: "Loading wallet providers...", duration: 1000 },
    { text: "Syncing blockchain data...", duration: 2000 },
    { text: "Initializing smart contracts...", duration: 1200 },
    { text: "Loading Pyth Network price feeds...", duration: 1800 },
    { text: "Establishing USDC Vaults...", duration: 1000 },
    { text: "Configuring liquidation protocol...", duration: 1300 },
    { text: "Loading governance interface...", duration: 1200 },
    { text: "System check complete. Ready to launch.", duration: 1000 }
  ];

  // Total duration of all boot steps
  const totalDuration = bootSequence.reduce((total, step) => total + step.duration, 0);

  // Add new line to terminal
  const addTerminalLine = useCallback((text, isStatus = false, isSuccess = false) => {
    setTerminalLines(prevLines => [...prevLines, { text, isStatus, isSuccess }]);
  }, []);

  // Simulate boot sequence
  useEffect(() => {
    let timer;
    let progressTimer;
    let forceReadyTimer;
    let elapsedTime = 0;
    let stepStartTime = 0;
    
    // Create particles
    const createParticles = () => {
      const container = document.querySelector('.particles-container');
      if (!container) return [];
      
      // Clear any existing particles
      container.innerHTML = '';
      
      const particles = [];
      const particleCount = 30;
      
      for (let i = 0; i < particleCount; i++) {
        const size = Math.random() * 4 + 1;
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const delay = Math.random() * 5;
        const duration = Math.random() * 10 + 10;
        
        const particle = document.createElement('div');
        particle.classList.add('particle');
        particle.style.setProperty('--x', `${x}%`);
        particle.style.setProperty('--y', `${y}%`);
        particle.style.setProperty('--size', `${size}px`);
        particle.style.setProperty('--delay', `${delay}s`);
        particle.style.setProperty('--duration', `${duration}s`);
        
        container.appendChild(particle);
        particles.push(particle);
      }
      
      return particles;
    };
    
    // Start boot sequence
    const runBootSequence = () => {
      if (currentStep < bootSequence.length) {
        const step = bootSequence[currentStep];
        addTerminalLine(step.text, true);
        
        stepStartTime = Date.now();
        
        timer = setTimeout(() => {
          addTerminalLine(step.text + " Complete", false, true);
          const nextStep = currentStep + 1;
          setCurrentStep(nextStep);
          elapsedTime += step.duration;
          
          if (nextStep >= bootSequence.length) {
            setSystemReady(true);
            setProgress(100);
            addTerminalLine("System initialization complete. Ready to launch.", false, true);
          } else {
            runBootSequence();
          }
        }, step.duration);
      }
    };
    
    // Update progress smoothly
    const updateProgress = () => {
      progressTimer = setInterval(() => {
        if (currentStep < bootSequence.length) {
          const currentStepDuration = bootSequence[currentStep].duration;
          const currentTimeInStep = Date.now() - stepStartTime;
          const progressInCurrentStep = Math.min(currentTimeInStep / currentStepDuration, 1);
          
          const previousStepsProgress = currentStep > 0 
            ? bootSequence.slice(0, currentStep).reduce((total, step) => total + step.duration, 0) / totalDuration * 100
            : 0;
            
          const currentStepTotalProgress = (bootSequence[currentStep].duration / totalDuration) * 100;
          const currentStepProgress = progressInCurrentStep * currentStepTotalProgress;
          
          const newProgress = Math.min(previousStepsProgress + currentStepProgress, 100);
          setProgress(newProgress);
        } else {
          clearInterval(progressTimer);
          setProgress(100);
        }
      }, 50);
    };
    
    // Force system ready after a timeout (safety measure)
    const forceReady = () => {
      // Force system ready after total duration + 2 seconds (safety margin)
      const forceReadyTimeout = totalDuration + 2000;
      forceReadyTimer = setTimeout(() => {
        if (!systemReady) {
          console.log("Forcing system ready state after timeout");
          setSystemReady(true);
          setProgress(100);
          addTerminalLine("System initialization complete. Ready to launch.", false, true);
        }
      }, forceReadyTimeout);
    };
    
    // Initial terminal line
    addTerminalLine("$ ./initialize_solidify.sh", false);
    addTerminalLine("SOLidify Protocol v1.0.0", false);
    
    // Create particles
    const particles = createParticles();
    
    // Start boot sequence after delay
    const initTimer = setTimeout(() => {
      runBootSequence();
      updateProgress();
      forceReady();
    }, 1000);
    
    return () => {
      clearTimeout(timer);
      clearTimeout(initTimer);
      clearTimeout(forceReadyTimer);
      clearInterval(progressTimer);
      if (particles && particles.length) {
        particles.forEach(particle => {
          if (particle.parentNode) {
            particle.parentNode.removeChild(particle);
          }
        });
      }
    };
  }, [currentStep, addTerminalLine, bootSequence, totalDuration, systemReady]);

  // Handle launch button click
  const handleLaunch = () => {
    if (typeof onLaunch === 'function') {
      onLaunch();
    }
  };

  // Manual override - immediately force ready state
  const handleForceReady = () => {
    if (!systemReady) {
      setSystemReady(true);
      setProgress(100);
      addTerminalLine("System initialization forced. Ready to launch.", false, true);
    }
  };

  return (
    <div className="launch-screen">
      <div className="grid-overlay"></div>
      <div className="particles-container"></div>
      
      <div className="launch-container">
        <div className="holographic-logo">
          <div className="logo-inner" onClick={handleForceReady}>
            <span className="sol">SOL</span><span className="idify">idify</span>
          </div>
          <div className="logo-glow"></div>
        </div>
        
        <div className="terminal">
          <div className="terminal-header">
            <div className="terminal-controls">
              <div className="control"></div>
              <div className="control"></div>
              <div className="control"></div>
            </div>
            <div className="terminal-title">SOLidify System Initialization</div>
          </div>
          
          <div className="terminal-body">
            {terminalLines.map((line, index) => (
              <div key={index} className="terminal-line">
                {!line.isStatus && !line.isSuccess && (
                  <span className="prompt">&gt;</span>
                )}
                {line.isStatus ? (
                  <span className="status">{line.text}</span>
                ) : line.isSuccess ? (
                  <span className="success">{line.text}</span>
                ) : (
                  line.text
                )}
              </div>
            ))}
            
            <div className="terminal-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="progress-percentage">{Math.round(progress)}% Complete</div>
            </div>
          </div>
        </div>
        
        {systemReady && (
          <button className="launch-button" onClick={handleLaunch}>
            <span className="launch-glow"></span>
            LAUNCH PROTOCOL
          </button>
        )}
        
        <div className="system-info">
          <div className="info-item">
            <span className="info-label">NETWORK</span>
            <span className="info-value">SOLANA DEVNET</span>
          </div>
          <div className="info-item">
            <span className="info-label">STATUS</span>
            <span className="info-value">{systemReady ? "READY" : "INITIALIZING"}</span>
          </div>
          <div className="info-item">
            <span className="info-label">PROTOCOL</span>
            <span className="info-value">v1.0.0</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LaunchScreen; 