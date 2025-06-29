// Game constants
const PADDLE_HEIGHT = 100;
const PADDLE_WIDTH = 15;
const PADDLE_SPEED = 8;
const BALL_SIZE = 15;
const BALL_SPEED = 5;
const BALL_ACCELERATION = 0.2;
const AI_DIFFICULTY = 0.7; // 0 to 1, higher is more difficult
const TRAIL_LENGTH = 10; // Number of positions to remember for the trail

// Game variables
let canvas, ctx;
let playerScore = 0;
let aiScore = 0;
let ballX, ballY;
let ballSpeedX, ballSpeedY;
let playerPaddleY;
let aiPaddleY;
let gameRunning = false;
let lastTime = 0;
let ballTrail = []; // Array to store previous ball positions

// Networking variables
let peer;
let conn;
let isClient = false;
let peerId;

// Initialize the game
function init() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');

    const params = new URLSearchParams(window.location.search);
    const hostId = params.get('host');
    isClient = !!hostId;

    peer = new Peer();
    peer.on('open', id => {
        peerId = id;
        if (isClient) {
            conn = peer.connect(hostId);
            conn.on('open', () => {
                startGame();
            });
            conn.on('data', handleHostData);
            document.getElementById('share-button').style.display = 'none';
            document.getElementById('share-link').style.display = 'none';
        } else {
            const link = `${location.origin}${location.pathname}?host=${id}`;
            const shareLinkEl = document.getElementById('share-link');
            shareLinkEl.innerHTML = `<a href="${link}">${link}</a>`;
            document.getElementById('share-button').addEventListener('click', () => {
                navigator.clipboard.writeText(link);
            });
            peer.on('connection', c => {
                conn = c;
                conn.on('data', handleClientData);
            });
        }
    });

    // Set initial positions
    resetBall();
    playerPaddleY = (canvas.height - PADDLE_HEIGHT) / 2;
    aiPaddleY = (canvas.height - PADDLE_HEIGHT) / 2;

    // Add event listeners
    document.getElementById('start-button').addEventListener('click', startGame);
    canvas.addEventListener('mousemove', movePaddle);

    // Initial render
    render();
}

// Start the game
function startGame() {
    document.getElementById('start-screen').style.display = 'none';
    gameRunning = true;
    playerScore = 0;
    aiScore = 0;
    updateScore();
    resetBall();
    requestAnimationFrame(gameLoop);
}

// Reset the ball to the center
function resetBall() {
    ballX = canvas.width / 2;
    ballY = canvas.height / 2;

    // Random direction
    ballSpeedX = (Math.random() > 0.5 ? 1 : -1) * BALL_SPEED;
    ballSpeedY = (Math.random() * 2 - 1) * BALL_SPEED;
}

// Update the score display
function updateScore() {
    document.getElementById('score').textContent = `${playerScore} : ${aiScore}`;
}

// Move the player paddle with the mouse
function movePaddle(e) {
    const rect = canvas.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;

    // Keep paddle within canvas bounds
    const newY = Math.max(0, Math.min(canvas.height - PADDLE_HEIGHT, mouseY - PADDLE_HEIGHT / 2));
    if (isClient) {
        aiPaddleY = newY;
        if (conn && conn.open) {
            conn.send({type: 'paddle', y: aiPaddleY});
        }
    } else {
        playerPaddleY = newY;
    }
}

// Update AI paddle position
function updateAI() {
    if (conn && conn.open) return;
    // AI tries to follow the ball with some delay/error
    const targetY = ballY - PADDLE_HEIGHT / 2;
    const aiReactionSpeed = PADDLE_SPEED * AI_DIFFICULTY;

    if (aiPaddleY + PADDLE_HEIGHT / 2 < targetY) {
        aiPaddleY += aiReactionSpeed;
    } else if (aiPaddleY + PADDLE_HEIGHT / 2 > targetY) {
        aiPaddleY -= aiReactionSpeed;
    }

    // Keep AI paddle within canvas bounds
    aiPaddleY = Math.max(0, Math.min(canvas.height - PADDLE_HEIGHT, aiPaddleY));
}

// Update ball position and check for collisions
function updateBall() {
    if (isClient) return;
    // Store current position in trail
    ballTrail.push({x: ballX, y: ballY});

    // Keep trail at desired length
    if (ballTrail.length > TRAIL_LENGTH) {
        ballTrail.shift();
    }

    // Move the ball
    ballX += ballSpeedX;
    ballY += ballSpeedY;

    // Top and bottom collisions
    if (ballY < 0 || ballY > canvas.height - BALL_SIZE) {
        ballSpeedY = -ballSpeedY;
        ballY = ballY < 0 ? 0 : canvas.height - BALL_SIZE;
    }

    // Player paddle collision
    if (ballX < PADDLE_WIDTH && 
        ballY + BALL_SIZE > playerPaddleY && 
        ballY < playerPaddleY + PADDLE_HEIGHT) {

        ballSpeedX = -ballSpeedX * (1 + BALL_ACCELERATION);

        // Adjust Y speed based on where the ball hit the paddle
        const hitPosition = (ballY + BALL_SIZE / 2) - (playerPaddleY + PADDLE_HEIGHT / 2);
        ballSpeedY = hitPosition * 0.2;
    }

    // AI paddle collision
    if (ballX > canvas.width - PADDLE_WIDTH - BALL_SIZE && 
        ballY + BALL_SIZE > aiPaddleY && 
        ballY < aiPaddleY + PADDLE_HEIGHT) {

        ballSpeedX = -ballSpeedX * (1 + BALL_ACCELERATION);

        // Adjust Y speed based on where the ball hit the paddle
        const hitPosition = (ballY + BALL_SIZE / 2) - (aiPaddleY + PADDLE_HEIGHT / 2);
        ballSpeedY = hitPosition * 0.2;
    }

    // Scoring
    if (ballX < 0) {
        aiScore++;
        updateScore();
        resetBall();
        // Clear trail on reset
        ballTrail = [];
    } else if (ballX > canvas.width) {
        playerScore++;
        updateScore();
        resetBall();
        // Clear trail on reset
        ballTrail = [];
    }

    if (conn && conn.open) {
        conn.send({
            type: 'state',
            ballX, ballY,
            playerScore, aiScore,
            playerPaddleY, aiPaddleY,
            ballTrail
        });
    }
}

// Render the game
function render() {
    // Clear the canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw center line
    ctx.strokeStyle = '#fff';
    ctx.setLineDash([10, 15]);
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw paddles
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, playerPaddleY, PADDLE_WIDTH, PADDLE_HEIGHT);
    ctx.fillRect(canvas.width - PADDLE_WIDTH, aiPaddleY, PADDLE_WIDTH, PADDLE_HEIGHT);

    // Draw ball trail
    if (ballTrail.length > 0) {
        for (let i = 0; i < ballTrail.length; i++) {
            // Calculate opacity based on position in trail (older = more transparent)
            // i=0 is oldest, i=length-1 is newest
            const opacity = (i + 1) / ballTrail.length * 0.7; // Max opacity of trail is 0.7
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.fillRect(ballTrail[i].x, ballTrail[i].y, BALL_SIZE, BALL_SIZE);
        }
    }

    // Draw ball (full opacity)
    ctx.fillStyle = '#fff';
    ctx.fillRect(ballX, ballY, BALL_SIZE, BALL_SIZE);
}

function handleClientData(data) {
    if (data.type === 'paddle') {
        aiPaddleY = data.y;
    }
}

function handleHostData(data) {
    if (data.type === 'state') {
        ballX = data.ballX;
        ballY = data.ballY;
        playerScore = data.playerScore;
        aiScore = data.aiScore;
        playerPaddleY = data.playerPaddleY;
        aiPaddleY = data.aiPaddleY;
        ballTrail = data.ballTrail;
        updateScore();
    }
}

// Main game loop
function gameLoop(timestamp) {
    if (!gameRunning) return;

    // Calculate delta time
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    // Update game state
    if (!isClient) {
        updateAI();
    }
    updateBall();

    // Render the game
    render();

    // Continue the loop
    requestAnimationFrame(gameLoop);
}

// Initialize the game when the page loads
window.onload = init;
