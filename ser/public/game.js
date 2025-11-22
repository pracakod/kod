// Elementy DOM
const welcomeScreen = document.getElementById('welcome-screen');
const gameScreen = document.getElementById('game-screen');
const playerNameInput = document.getElementById('player-name');
const joinButton = document.getElementById('join-button');
const statusMessage = document.getElementById('status-message');
const mainClicker = document.getElementById('main-clicker');
const totalClicksEl = document.getElementById('total-clicks');
const clickBonusEl = document.getElementById('click-bonus');
const buyAutoClicker = document.getElementById('buy-auto-clicker');
const buyClickBonus = document.getElementById('buy-click-bonus');
const playersList = document.getElementById('players-list');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChat = document.getElementById('send-chat');
const starsContainer = document.getElementById('stars-container');
const resetGameBtn = document.getElementById('reset-game-btn');

// Stan gry
let socket = null;
let playerId = null;
let playerName = '';
let players = {};
let totalClicks = 0;
let autoClickers = 0;
let clickBonus = 1;

// Połączenie WebSocket
function connectToServer() {
  const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  socket = new WebSocket(`${protocol}${window.location.host}`);
  
  socket.onopen = () => {
    console.log('🚀 Połączono z serwerem kosmicznym!');
  };
  
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
  };
  
  socket.onclose = () => {
    showStatus('❌ Utracono połączenie z serwerem!');
  };
  
  socket.onerror = (error) => {
    console.error('Błąd WebSocket:', error);
    showStatus('💥 Błąd połączenia z serwerem!');
  };
}

// Obsługa wiadomości z serwera
function handleServerMessage(data) {
  switch(data.type) {
    case 'full':
      showStatus('🛸 Serwer jest pełny! Spróbuj później.');
      break;
      
    case 'init':
      playerId = data.playerId;
      const gameStateData = data.gameState;
      players = gameStateData.players;
      totalClicks = gameStateData.totalClicks;
      autoClickers = gameStateData.autoClickers;
      clickBonus = gameStateData.clickBonus;
      
      updateGameStats();
      updatePlayersList();
      showGameScreen();
      
      if (gameStateData.gameStatus === 'playing') {
        showStatus('🚀 Gra trwa! Kontynuuj misję.');
      } else if (gameStateData.gameStatus === 'finished') {
        showStatus('🎉 Misja ukończona! Rozpocznij nową.');
      }
      break;
      
    case 'player_joined':
      players = data.players;
      updatePlayersList();
      addChatMessage('🤖', 'System', `${data.player.name} dołączył do misji!`);
      showStatus(`👽 ${data.player.name} dołączył do poszukiwania prawdy!`);
      break;
      
    case 'player_left':
      players = data.players;
      updatePlayersList();
      addChatMessage('🤖', 'System', 'Gracz opuścił misję...');
      showStatus('📡 Gracz opuścił misję...');
      break;
      
    case 'game_started':
      showStatus('🚀 MISJA ROZPOCZĘTA! Klikajcie dla prawdy!');
      createNotification('🚀 MISJA ROZPOCZĘTA!');
      break;
      
    case 'click_update':
      totalClicks = data.totalClicks;
      updateGameStats();
      checkAchievements();
      break;
      
    case 'upgrade_bought':
      const gameStateUpdate = data.gameState;
      totalClicks = gameStateUpdate.totalClicks;
      autoClickers = gameStateUpdate.autoClickers;
      clickBonus = gameStateUpdate.clickBonus;
      updateGameStats();
      createUpgradeEffect();
      break;
      
    case 'chat_message':
      addChatMessage('💬', data.playerName, data.message);
      break;
      
    case 'game_reset':
      showStatus('🔄 Gra została zresetowana!');
      setTimeout(() => {
        location.reload();
      }, 2000);
      break;
  }
}

// Wyświetlanie ekranów
function showWelcomeScreen() {
  welcomeScreen.style.display = 'block';
  gameScreen.style.display = 'none';
}

function showGameScreen() {
  welcomeScreen.style.display = 'none';
  gameScreen.style.display = 'block';
}

// Status i powiadomienia
function showStatus(message) {
  statusMessage.textContent = message;
  setTimeout(() => {
    statusMessage.textContent = '';
  }, 3000);
}

function createNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Dołączanie do gry
joinButton.addEventListener('click', () => {
  const name = playerNameInput.value.trim() || `Gracz_${Math.floor(Math.random() * 1000)}`;
  playerName = name;
  
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    connectToServer();
  }
  
  // Opóźnienie na nawiązanie połączenia
  setTimeout(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'join',
        name: playerName
      }));
    }
  }, 100);
});

// Obsługa kliknięcia głównego przycisku
mainClicker.addEventListener('click', (event) => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'click'
    }));
    
    // Efekt wizualny
    createClickEffect(event);
    animateButtonClick();
  }
});

// Efekt kliknięcia
function createClickEffect(event) {
  const rect = mainClicker.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  
  // Twórz cząsteczki
  for (let i = 0; i < 8; i++) {
    const particle = document.createElement('div');
    particle.className = 'click-particle';
    particle.style.left = x + 'px';
    particle.style.top = y + 'px';
    particle.style.backgroundColor = `hsl(${Math.random() * 360}, 70%, 60%)`;
    
    const angle = (Math.PI * 2 * i) / 8;
    const distance = 30 + Math.random() * 20;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    
    particle.style.setProperty('--tx', tx + 'px');
    particle.style.setProperty('--ty', ty + 'px');
    
    mainClicker.appendChild(particle);
    
    setTimeout(() => {
      particle.remove();
    }, 1000);
  }
}

// Animacja przycisku
function animateButtonClick() {
  mainClicker.classList.add('button-click-animation');
  setTimeout(() => {
    mainClicker.classList.remove('button-click-animation');
  }, 200);
}

// Aktualizacja statystyk
function updateGameStats() {
  totalClicksEl.textContent = totalClicks;
  clickBonusEl.textContent = (autoClickers + clickBonus).toFixed(1);
  
  // Efekt dla dużych liczb
  if (totalClicks > 500) {
    totalClicksEl.style.color = '#4CAF50';
    totalClicksEl.style.textShadow = '0 0 10px #4CAF50';
  }
  
  // Sprawdź ukończenie
  if (totalClicks >= 1000) {
    mainClicker.classList.add('victory-animation');
    showStatus('🎉 UKRYTA PRAWDA ODSŁONIĘTA! MISJA WYKONANA!');
    createNotification('🎉 UKRYTA PRAWDA ODSŁONIĘTA!');
  }
}

// Aktualizacja listy graczy
function updatePlayersList() {
  playersList.innerHTML = '';
  
  Object.values(players).forEach(player => {
    const playerEl = document.createElement('div');
    playerEl.className = `player-status ${player.joined ? '' : 'offline'}`;
    playerEl.innerHTML = `
      <span class="player-indicator">${player.joined ? '🟢' : '🔴'}</span>
      <span class="player-name">${player.name}</span>
    `;
    playersList.appendChild(playerEl);
  });
}

// Czat
sendChat.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendChatMessage();
  }
});

function sendChatMessage() {
  const message = chatInput.value.trim();
  if (message && socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'chat',
      message: message
    }));
    chatInput.value = '';
  }
}

function addChatMessage(icon, username, message) {
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-message new-message';
  messageEl.innerHTML = `
    <span class="chat-icon">${icon}</span>
    <span class="chat-username">${username}:</span>
    <span class="chat-text">${message}</span>
  `;
  
  chatMessages.appendChild(messageEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  // Usuń animację po chwili
  setTimeout(() => {
    messageEl.classList.remove('new-message');
  }, 2000);
}

// Upgrade'y
buyAutoClicker.addEventListener('click', () => {
  if (totalClicks >= 50 && socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'buy_upgrade',
      upgrade: 'auto_clicker'
    }));
    buyAutoClicker.classList.add('upgrade-purchased');
    setTimeout(() => {
      buyAutoClicker.classList.remove('upgrade-purchased');
    }, 500);
  }
});

buyClickBonus.addEventListener('click', () => {
  if (totalClicks >= 75 && socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'buy_upgrade',
      upgrade: 'click_bonus'
    }));
    buyClickBonus.classList.add('upgrade-purchased');
    setTimeout(() => {
      buyClickBonus.classList.remove('upgrade-purchased');
    }, 500);
  }
});

// Reset gry
resetGameBtn.addEventListener('click', () => {
  if (confirm('🚨 Na pewno chcesz zresetować całą misję? Wszyscy gracze zostaną rozłączeni!')) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'reset_game'
      }));
    }
  }
});

// Efekty upgrade'ów
function createUpgradeEffect() {
  const effect = document.createElement('div');
  effect.className = 'achievement-unlocked';
  effect.innerHTML = '🔬 Ulepszenie zakupione!';
  document.body.appendChild(effect);
  
  setTimeout(() => {
    effect.remove();
  }, 3000);
}

// Osiągnięcia
function checkAchievements() {
  // Można dodać więcej osiągnięć
  if (totalClicks === 100) {
    createNotification('🌟 Osiągnięcie: Pierwsze 100 dowodów!');
  }
  if (totalClicks === 500) {
    createNotification('🚀 Osiągnięcie: Połowa misji wykonana!');
  }
}

// Tło z gwiazdami
function createStars() {
  // Usuń istniejące gwiazdy
  starsContainer.innerHTML = '';
  
  // Dodaj stałe gwiazdy
  for (let i = 0; i < 100; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    star.style.left = Math.random() * 100 + '%';
    star.style.top = Math.random() * 100 + '%';
    star.style.width = (Math.random() * 3 + 1) + 'px';
    star.style.height = star.style.width;
    star.style.setProperty('--duration', (Math.random() * 3 + 2) + 's');
    starsContainer.appendChild(star);
  }
  
  // Dodaj spadające gwiazdy okresowo
  setInterval(createFallingStar, 3000);
}

function createFallingStar() {
  const fallingStar = document.createElement('div');
  fallingStar.className = 'falling-star';
  fallingStar.style.left = Math.random() * 100 + '%';
  fallingStar.style.top = '-30px';
  fallingStar.style.animationDuration = (Math.random() * 2 + 1) + 's';
  starsContainer.appendChild(fallingStar);
  
  setTimeout(() => {
    fallingStar.remove();
  }, 3000);
}

// Inicjalizacja
document.addEventListener('DOMContentLoaded', () => {
  createStars();
  showWelcomeScreen();
  
  // Domyślne imię dla testów
  playerNameInput.value = `Prawdziwy_${Math.floor(Math.random() * 100)}`;
});

// Efekt dla auto-clickerów
setInterval(() => {
  if (autoClickers > 0) {
    buyAutoClicker.classList.add('auto-clicker-active');
    setTimeout(() => {
      buyAutoClicker.classList.remove('auto-clicker-active');
    }, 1000);
  }
}, 5000);