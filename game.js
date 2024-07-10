// RequestAnimationFrame polyfill
(function() {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];

    for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
        window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame']
                                   || window[vendors[x]+'CancelRequestAnimationFrame'];
    }

    if (!window.requestAnimationFrame) {
        window.requestAnimationFrame = function(callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function() { callback(currTime + timeToCall); },
              timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };
    }

    if (!window.cancelAnimationFrame) {
        window.cancelAnimationFrame = function(id) {
            clearTimeout(id);
        };
    }
}());

// Global variables
var canvas, context, canvasW, canvasH, canvasCX, canvasCY, cursorData;
var lastUpdate = Date.now();
var spikeInterval = 0;
var ballRotation = 0;
var rotationSpeed = 0;
var rotationDamping = 0.99; // Damping factor to slow down rotation
var game = {
    state: 'loading', // loading, ready, first_half, over
    background: 'transparent',
    dayColor: 'white',
    nightColor: 'black',
    gravity: 0,
    friction: 0,
    juggle: 0,
    score: 0,
    highscore: 0,
    highscoreEver: 0,
    triesInitial: 1, // Only one try
    tries: 1,
    onlyFirstTry: true,
    floorTouched: false,
    ballHit: false,
    emittActive: false,
    emittSpike: false,
    scoreBoard: {
        color: 'white',
        background: 'black'
    },
    popup: {
        color: 'white',
        background: 'black'
    },
    message: [
              "OOPS! Let's try again",
              "Skillful!",
              "You're doing great!"
            ],
    ceiling: 80,
    gameStarted: false,
    interactionEnabled: false
};

var spike = {
    color: game.nightColor,
    width: 40,
    height: 20,
    count: 0,
    randomNum: 4,
    posYStart: 0,
    posYFalling: 0,
    falling: false,
    speedModifier: 10, // 1 is fastest 10 is slowest
    tick: 4600 // Tick as lower and lower, time for the spikes fall is faster and shorter
}

var ballData = {
    posX: 0,
    posY: 0,
    velX: 0,
    velY: 0,
    velMin: 0,
    velMax: 40,
    stopPointTreshold: 0.1,
    juggleFactor: 0.5,
    radius: scaleValue(60),
    color: game.nightColor,
};

var ballImage = new Image();
ballImage.src = 'football-no-background.png';

function init(){
    canvas = document.getElementById('gameCanvas');
    context = canvas.getContext('2d');

    // Add canvas to body
    document.body.appendChild(canvas);

    // Setup canvas dimensions
    resizeCanvas();

    // Set ball spawn position
    ballPositionSpawn();

    // Init mousedown listener
    canvas.addEventListener('pointerdown', function(e) {
        e.preventDefault();
        cursorData = getCursorPosition(this, e);
        updateGameState();
        if (game.gameStarted && game.interactionEnabled) {
            handlejuggle(cursorData);
        }
    });

    // Add resize listener
    window.addEventListener('resize', resizeCanvas);

    game.state = 'ready';
    animate();
}

//Updated part - resize Canvas function
function resizeCanvas() {
    var oldCanvasW = canvasW;
    var oldCanvasH = canvasH;

    let sidebar = document.querySelector('.sidebar');
    let sidebarWidth = sidebar.classList.contains('active') ? 240 : 78;

    canvas.width = window.innerWidth - sidebarWidth;
    canvas.height = window.innerHeight;
    canvasW = canvas.width;
    canvasH = canvas.height;
    canvasCX = canvasW / 2;
    canvasCY = canvasH / 2;
    spike.count = canvasW / spike.width ;
    
    if (oldCanvasW && oldCanvasH) {
        ballData.posX = (ballData.posX / oldCanvasW) * canvasW;
        ballData.posY = (ballData.posY / oldCanvasH) * canvasH;
    }
    ballData.radius = scaleValue(60);
    scalePhysics();
}

function scalePhysics() {
    var scaleFactor = Math.min(canvasW / 768, canvasH / 1366);
    if (canvasW <= 480) {
        game.gravity = 1.3 * scaleFactor;
        game.friction = 0.009 * scaleFactor;
    } else if (canvasW <= 720) {
        game.gravity = 1.35 * scaleFactor;
        game.friction = 0.0094 * scaleFactor;
    } else if (canvasW <= 960) {
        game.gravity = 1.1 * scaleFactor;
        game.friction = 0.0097 * scaleFactor;
    } else {
        game.gravity = 1 * scaleFactor;
        game.friction = 0.01 * scaleFactor;
    }
}

function animate() {
    requestAnimationFrame(animate);
    var now = Date.now();
    var dt = now - lastUpdate;
    lastUpdate = now;
    render(dt);
}

// Main game loop where all data is updated
function render(dt) {
    // clear scene
    renderClear();

    // update scoreboard
    scoreBoardRender();

    // update spikes and falling spike
    drawSpikes(dt);

    // update spikes and falling spike
    drawBall(dt);
    
    if(game.ballHit && game.tries > 0 && game.tries < game.triesInitial) {
        popupRender('hit');
    }
    if(game.state == 'ready') {
        popupRender('start');
    }
    if(game.state == 'over') {
        popupRender('restart');
    }
}

// Reset game when game over popup is clicked
function gameReset(){
    setDayNight('day');
    ballPositionSpawn();
    triesReset();
    juggleReset();
    highscoreReset();
    rotationSpeed = 0;
    game.score = 0;
    resetSpikeSpeedAndTick();
}

function setSpikeInterval() {
    spikeInterval = setInterval(function(){
        if(game.emittActive) {
            game.emittSpike = true;
            spike.falling = true;
        }
    }, spike.tick);
}

// Handle juggle logic
function handlejuggle(cursorData) {
    if(ballData.posX - ballData.radius < cursorData.x &&
       ballData.posX + ballData.radius > cursorData.x &&
       ballData.posY - ballData.radius < cursorData.y &&
       ballData.posY + ballData.radius > cursorData.y) {
        
        juggleIncrement();
        
        game.floorTouched = false;

        var touchPointData = getTouchPoint(cursorData);

        // Calculate ball direction from the clicked point on the ball
        if(touchPointData.x < 0) {
            ballData.velX = 0;
            ballData.velX += -(touchPointData.x * 0.1);
            rotationSpeed = -Math.abs(ballData.velX * (Math.random() * 0.01 + 0.03)); // Set rotation based on direction
        } else if (touchPointData.x > 0) {
            ballData.velX = 0;
            ballData.velX += -(touchPointData.x * 0.1);
            rotationSpeed = Math.abs(ballData.velX * (Math.random() * 0.01 + 0.03)); // Set rotation based on direction
        } else {
            ballData.velX = 0;
        }

        ballData.velY -= (game.gravity + 20);
        
        // Adjust speedModifier and tick
        adjustSpikeSpeedAndTick();
    }
}

// Adjust spike speedModifier and tick based on juggle count
function adjustSpikeSpeedAndTick() {
    const juggleCount = game.juggle;
    
    if (juggleCount % 10 === 0) {
        spike.speedModifier = Math.max(1, spike.speedModifier - 0.5);
        spike.tick = Math.max(1000, spike.tick - 200);
    }
    console.log("Speed: " + spike.speedModifier + ", Tick: " + spike.tick);
}

// Reset spike speedModifier and tick to defaults
function resetSpikeSpeedAndTick() {
    spike.speedModifier = 10;
    spike.tick = 4600;
}

// Ball draw function
function drawBall(dt){
    // Update radius dynamically
    ballData.radius = scaleValue(80);
    // X Axis update
    if (ballData.velX < 0) {
        ballData.velX += game.friction * (dt * 0.1);
        if(ballData.velX > -ballData.stopPointTreshold) {
            ballData.velX = 0;
        }
    }
    else if (ballData.velX > 0) {
        ballData.velX -= game.friction * (dt * 0.1);
        if(ballData.velX < ballData.stopPointTreshold) {
            ballData.velX = 0;
        }
    }
    else {
        ballData.velX = 0
    }

    if (ballData.posX - ballData.radius < 0) {
        ballData.velX = -ballData.velX;
        rotationSpeed = -rotationSpeed; // Invert rotation direction
    }
    else if(ballData.posX + ballData.radius > canvasW) {
        ballData.velX = -ballData.velX;
        rotationSpeed = -rotationSpeed; // Invert rotation direction
    }

    ballData.posX += ballData.velX * dt * 0.1;

    if (ballData.posY - ballData.radius < game.ceiling) {
        ballData.velY = -ballData.velY;
        ballHitStateUpdate();
    }

    // Y Axis update
    if(ballData.velY < ballData.velMax) {
        ballData.velY += game.gravity;
    }
    // keep falling until floor touched
    if (ballData.posY + ballData.velY + ballData.radius < canvasH) {
        ballData.posY += ballData.velY + dt * 0.1;
    }
    else {
        juggleReset();

        if(!game.floorTouched) {
            game.floorTouched = true;
            ballHitStateUpdate();
        }

        ballData.posY = canvasH - ballData.radius;
        ballData.velY *= -ballData.juggleFactor;

        // Apply rotationDamping when the ball touches the ground
        rotationSpeed *= rotationDamping;
        if (Math.abs(rotationSpeed) < 0.01) {
            rotationSpeed = 0; // Stop rotation when it is slow enough
        }
    }

    // Update rotation
    ballRotation += rotationSpeed;
    
    // Draw the rotated ball
    context.save();
    context.translate(ballData.posX, ballData.posY);
    context.rotate(ballRotation);
    context.drawImage(ballImage, -ballData.radius, -ballData.radius, ballData.radius * 2, ballData.radius * 2);
    context.restore();
}

// Update game state transitions
function updateGameState() {
    if (game.state == 'ready') {
        game.state = 'first_half';
        setSpikeInterval();
        game.emittActive = true;
        game.gameStarted = true; // Set the flag to true when the game starts

        // Delay interaction with the ball to prevent immediate juggle
        setTimeout(() => {
            game.interactionEnabled = true;
        }, 200); // 200 milliseconds delay
    }

    if (game.state == 'over') {
        gameReset();
        game.state = 'ready';
        game.emittActive = false;
        game.gameStarted = false; // Reset the flag when the game is over
        game.interactionEnabled = false; // Disable interaction
    }
}

// Spike movement and reset
function drawSpikes(dt) {
    // update falling spike velocity
    if(spike.falling && game.state == 'first_half') {
        spike.velY += game.gravity / spike.speedModifier * (dt * 0.1);
    }

    // update falling spike number after emitt
    if(game.emittSpike && game.state == 'first_half') {
        game.emittSpike = false;
        spike.falling = true;
        spike.randomNum = Math.floor(ballData.posX / spike.width);
    }

    for(var i = 0; i <= spike.count; i++) {
        if(i != spike.randomNum){
            spikeDrawStatic(i, spike.color);
        }
        else {
            var ballRadius = ballData.radius
            var posXFalling = spike.posXFalling;
            var posYFalling = spike.posYFalling;

            if(posYFalling < canvasH - spike.height
            && (posXFalling < ballData.posX - ballRadius
            ||  posXFalling > ballData.posX + ballRadius
            ||  posYFalling < ballData.posY - ballRadius
            ||  posYFalling > ballData.posY + ballRadius)) {
                if(game.state == 'first_half') {
                    spike.posYFalling = posYFalling + spike.velY;
                }
                else {
                    spike.posYFalling = spike.posYStart;
                }
            }
            else {
                if((game.state == 'first_half')
                && posYFalling > ballData.posY - ballRadius
                && posYFalling < ballData.posY + ballRadius
                && posYFalling < canvasH - spike.height) {
                    game.ballHit = true;
                    juggleReset();
                    ballWasHit();
                    game.state = 'over';
                }
                spike.posYFalling = spike.posYStart;
                spike.velY = 0;
                spike.falling = false;
            }
            spikeDrawFalling(i, spike.posYFalling, spike.color);
        }
    }
}

function ballHitStateUpdate() {
    if (game.state == 'first_half') {
        game.ballHit = true;
        ballWasHit();
        game.state = 'over';
    }
}

// Ball was hit logic and reset values
function ballWasHit() {
    triesDecrement();
    spike.falling = false;
    game.emittActive = false;
    clearInterval(spikeInterval);
    spike.velY = 0;
    spike.posYFalling = spike.posYStart;

    // Reset speedModifier and tick if the game is over
    if (game.state == 'first_half' || game.state == 'over') {
        resetSpikeSpeedAndTick();
    }
}

// Initial ball position spawn
function ballPositionSpawn() {
    ballData.radius = scaleValue(60);
    ballData.velX = 0;
    ballData.velY = 0;
    rotationSpeed = 0;
    ballData.posX = canvasCX;
    ballData.posY = canvasH - ballData.radius;
}

// Juggles the ball after click
function juggle(){
    ballData.posY = canvasH - ballData.radius;
    ballData.velY *= -ballData.juggleFactor;
}

// Scoreboard update functions
function juggleRender() {
    context.font = scaleFontSize(22) + 'px Pusab, sans-serif' ;
    context.fillStyle = game.scoreBoard.color;
    context.textAlign = 'left';
    context.fillText('JUGGLES: ' + game.juggle, scaleValue(10), scaleValue(26));
}

function juggleIncrement() {
    game.juggle += 1;
}

function juggleReset() {
    if(game.juggle > game.highscore) {
        game.highscore = game.juggle;
    }
    if(game.juggle > game.highscoreEver) {
        game.highscoreEver = game.juggle;
    }
    game.juggle = 0;
    resetSpikeSpeedAndTick();
}

function currentBallEarned() {
    let reward = 0;
    let increment = 0.01;
    for (let i = 1; i <= game.juggle; i++) {
        reward += increment;
        if (i % 10 === 0) {
            increment += 0.01;
        }
    }
    return reward.toFixed(2);
}

function highscoreRender() {
    context.font = scaleFontSize(22) + 'px Pusab, sans-serif';
    context.textAlign = 'right';
    context.fillStyle = game.scoreBoard.color;
    context.fillText("BEST: " + game.highscoreEver, canvasW - scaleValue(10), scaleValue(26));
}

function triesDecrement() {
    if(game.tries > 1) {
        game.tries -= 1;
    } else {
        game.tries = 0;
    }
}

function triesReset() {
    game.tries = game.triesInitial;
}

function totalBallEarnedRender() {
    context.font = scaleFontSize(22) + 'px Pusab, sans-serif';
    context.textAlign = 'center';
    context.fillStyle = game.scoreBoard.color;
    currentBallEarned();
    context.fillText('BALL EARNED: ' + currentBallEarned(), canvasCX, scaleValue(26));
}

function highscoreReset() {
    game.highscore = 0;
}

function scoreBoardRender() {
    context.fillStyle = game.scoreBoard.background;
    context.fillRect(0, 0, canvasW, scaleValue(40));
    juggleRender();
    totalBallEarnedRender();
    highscoreRender();
}

// Popup switcher
function popupRender(type) {
    switch(type){
        case 'start':
            popupDrawStart();
            break;
        case 'restart':
            popupDrawRestart();
            break;
    }
}

// Lazy popup and style formatting code
function popupDrawStart() {
    rotationSpeed = 0;
    setDayNight('day');
    context.fillStyle = game.dayColor;
    context.fillRect(0, 0, canvasW, canvasH);
    context.font = 'bold ' + scaleValue(64) + 'px Pusab, sans-serif';
    context.fillStyle = game.nightColor;
    context.textAlign = 'center';
    context.fillText('BALL JUGGLING', canvasCX, canvasCY - scaleValue(120));
    context.font = 'bold ' + scaleFontSize(34) + 'px Pusab, sans-serif';
    context.fillText('LET TRY YOUR SKILLS!', canvasCX, canvasCY - scaleValue(70));
    context.font = 'bold ' + scaleFontSize(34) + 'px Pusab, sans-serif';
    context.fillText('TAP TO START', canvasCX, canvasCY + scaleValue(120));
}

function popupDrawRestart() {
    rotationSpeed = 0;
    context.fillStyle = game.nightColor;
    context.fillRect(0, 0, canvasW, canvasH);
    context.font = scaleFontSize(48) + 'px Pusab, sans-serif';
    context.fillStyle = game.dayColor;
    context.textAlign = 'center';
    context.fillText('YOU DID', canvasCX, canvasCY - scaleValue(120));
    context.font = 'bold ' + scaleFontSize(48) + 'px Pusab, sans-serif';
    var s = (game.highscore === 1 || 0) ? '' : 'S';
    context.fillText(game.highscore + ' JUGGLE'+ s +'!', canvasCX, canvasCY - scaleValue(80));
    context.font = scaleFontSize(32) + 'px Pusab, sans-serif';
    context.fillText(game.message, canvasCX, canvasCY);
    context.font = scaleFontSize(32) + 'px Pusab, sans-serif';
    context.fillText('GAME OVER.', canvasCX, canvasCY + scaleValue(100));
    context.fillText('CLICK TO RETRY.', canvasCX, canvasCY + scaleValue(140));
    game.onlyFirstTry = true;
    game.message = getRandomMessage(game.juggle);
}

// Reversing scene colors
function setDayNight(dayNight) {
    if(dayNight == 'night') {
        document.body.style.background = game.nightColor;
        document.getElementsByTagName('canvas')[0].style.borderColor = game.dayColor;
        game.scoreBoard.color = game.nightColor;
        game.scoreBoard.background = game.dayColor;
        ballData.color = game.dayColor;
        spike.color = game.dayColor;
    }
    else {
        document.body.style.background = game.dayColor;
        document.getElementsByTagName('canvas')[0].style.borderColor = game.nightColor;
        game.scoreBoard.color = game.dayColor;
        game.scoreBoard.background = game.nightColor;
        ballData.color = game.nightColor;
        spike.color = game.nightColor;
    }
}

// Spike draw functions
function spikeDrawStatic(multiplier, c) {
    context.fillStyle = c;
    context.beginPath();
    context.moveTo(0 + (spike.width * multiplier),scaleValue(40));
    context.lineTo(scaleValue(20) + (spike.width * multiplier),scaleValue(60));
    context.lineTo(scaleValue(40) + (spike.width * multiplier),scaleValue(40));
    context.fill();
}

function spikeDrawFalling(multiplierX, multiplierY, c) {
    spike.posXFalling = scaleValue(20) + (spike.width * multiplierX);
    context.fillStyle = c;
    context.beginPath();
    context.moveTo(0 + (spike.width * multiplierX),scaleValue(40) + spike.posYFalling);
    context.lineTo(scaleValue(20) + (spike.width * multiplierX),scaleValue(60) + spike.posYFalling);
    context.lineTo(scaleValue(40) + (spike.width * multiplierX),scaleValue(40) + spike.posYFalling);
    context.fill();
}

// Click coordinates
function getCursorPosition(canvas, event) {
    var relative = canvas.getBoundingClientRect();
    var cpX = (event.pageX - relative.left) * (canvas.width / relative.width);
    var cpY = (event.pageY - relative.top) * (canvas.height / relative.height);

    return {
      x: cpX,
      y: cpY
    };
}

// Calculate ball touch point
function getTouchPoint(data) {
    var pX = Math.floor(-(ballData.posX - data.x));
    var pY = Math.floor(-(ballData.posY - data.y));

    return {
        x: pX,
        y: pY
    };
}

// Random integer helper
function getRandomInt(min, max){
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Clear canvas
function renderClear(){
    context.clearRect(0, 0, canvasW, canvasH);
}

function scaleValue(value) {
    var scaleFactor = Math.min(canvasW / 640, canvasH / 960);
    return value * scaleFactor;
}

function scaleFontSize(value) {
    var scaleFactor = Math.min(canvasW / 640, canvasH / 960);
    return value * scaleFactor;
}

function getRandomMessage() {
    let currentMessage;
    if (game.juggle <= 50) {
        currentMessage = [
            "OOPS! Let's try again"
        ];
    } else if (game.juggle <= 100) {
        currentMessage = [
            "You're doing great!"
        ]
    } else {
        currentMessage = [
            "Skillful!"
        ]
    }
    return currentMessage;
}