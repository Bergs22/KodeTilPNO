/*Dette er serveren til et af mine projekter på universitetet,
  hvor jeg og nogle medstuderende lavede en hjemmeside med Node.Js og JQuery.
  På hjemmesiden kan hver bruger stemme på et træk der skal tages næste gang.
  Serveren vælger så det træk med de fleste stemmer og turen skiftes til modstanderholdet.
  
  Serveren er en websocket server, hvor klienterne er spillerne på hjemmesiden.

*/
http = require('http');

var WebSocketServer = require('websocket').server;
var clients = [];
var board = require('./Pieces');
var DEBUG = true;
var TIME_PER_TURNS = 10; //Variable til hvor lang tid en tur varer.
var timeLeft = 0;
var currentSide = "white";
var clientAlignment = {};
var blackCount = 0;
var whiteCount = 0;
var clientVotes = {};

board.initialiseBoard(); //Initialiserer skakbrættet som er lavet med et library ved navn Chess.Js som har grafik for brættet og brikkerne. 
						 //Vi valgte at bruge et library da det ville tage langt tid at designe og tegne brættet og brikkerne selv.

//Opretter en Http serveren, det havde dog været bedst at benytte Https for ikke at sende synligt data.
var server = http.createServer(function (request, response) {
});
/*Funktion til at tjekke om serveren er tændt.
  Den skriver kort at den kører i konsollen.
*/ 
server.listen(5000, function () {
    console.log("I am running!");
});
/*Her oprettes vores Websocket server,
  valget faldt på en Websocket server fordi vi gerne ville have at spillet skulle være let tilgængeligt.
  Problemet ved en Websocket server er dog at hvis for mange brugere vil ind på samme tid kan serveren gå ned.
*/ 
wsServer = new WebSocketServer({
    httpServer: server
});

//En klient prøver at skabe forbindelse til serveren.
wsServer.on('request', function (request) {
 
	if (timerRunning === false) {
        startTimer();
    }
	
    var connection = request.accept('echo-protocol', request.origin);
    clients.push(connection);
    var id = clients.length - 1;
    console.log((new Date()) + ' Connection accepted [' + id + ']');
    /*Sender en besked til spillets chat, hvor spillerne kan snakke med hindanden for at aftale træk der skal tages.
	  Dette blev lavet fordi spil med flere spillere ofte kræver koordination mellem spillerne.
	*/
	connection.sendUTF(JSON.stringify("Welcome to the gameserver"));
    //Spillerne bliver automatisk sat på et hold. 
    if (whiteCount > blackCount) {
        clientAlignment[id] = "black";
        blackCount++;
    } else {
        clientAlignment[id] = "white";
        whiteCount++;
    }
	//Serveren giver spilleren besked på hvilket hold de er på.
    connection.sendUTF(JSON.stringify({action: "color", color: clientAlignment[id]}))

    connection.on('message', function (message) {
        handleIncomingMessage(connection, message);
    });
	//Når spilleren forlader serveren fjernes de fra deres hold.
    connection.on('close', function (reasonCode, description) {
        delete clients[id];
        if (clientAlignment[id] === "black") {
            blackCount--;
        } else {
            whiteCount--;
        }
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
    });
});

var interval;
var timerRunning = false;

function startTimer() {
    stopTimer();
    timerRunning = true;
    interval = setInterval(countdownTimer, 1000);
}

function stopTimer() {
    if (interval !== null) {
        clearInterval(interval);
        timerRunning = false;
    }
}
//Serveren viser hvilket hold spilleren er på.
function broadcastCurrentSide() {
    clients.forEach(function (client) {
        sendCurrentSide(client);
    });
}
//Funktion til at skifte hold.
function swapSide() {
    if (currentSide === "white") {
        currentSide = "black";
    } else {
        currentSide = "white";
    }
    broadcastCurrentSide();
}
//Serveren viser brættet til klienterne.
function broadcastBoard() {
    clients.forEach(function (client) {
        sendBoard(client);
    });
}
/*
  Funktionen der står for at udføre trækkene som spillerne stemmer på.
  Det er serveren som udfører alle spillets handlinger for at undgå snyd, da man derfor ikke kan tilgå koden igennem en web browser.
*/
function performMove() {
    var moves = sumVotes();
    if(moves.length === 0) return false;
    var move = moves[0].key;
    board.movePieceByCoord(move.split("-")[0], move.split("-")[1]);
    broadcastMove(move.split("-")[0], move.split("-")[1]);
    clientVotes = {};
    broadcastVotes();
    if(board.gameOver().isGameOver) {
        board.resetBoard();
        broadcastBoard();
    }
    return true;
}

function sortDictionaryByValue(dictionary) {
    var keys = Object.keys(dictionary);
    var i, len = keys.length;
    keys.sort();
    var sortedDict = [];
    for (i = 0; i < len; i++)
    {
        k = keys[i];
        sortedDict.push({'key': k, 'value':dictionary[k]});
    }
    return sortedDict;
}
// Denne funktion tæller alle stemmerne sammen og vælger det træk der har fået flest stemmer.
function sumVotes() {
    var moves = {};
    for (var id in clientVotes) {
        if (clientVotes.hasOwnProperty(id)) {
            console.log(clientVotes[id]);
            if(clientVotes[id] in moves) {
                moves[clientVotes[id]] += 1;
            } else {
                moves[clientVotes[id]] = 1;
            }
        }
    }
    moves = sortDictionaryByValue(moves);
    return moves;
}
//Sender en liste af træk fra klienten til serveren.
function sendMovesList(client, moves) {
    client.sendUTF(JSON.stringify({action: "movesList", moves: JSON.stringify(moves)}));
}
//Serveren viser de træk der ha fået flest stemmer.
function broadcastVotes() {
    var moves = sumVotes();
    clients.forEach(function (client) {
        sendMovesList(client, moves);
    });

}
// En timer til en nedtælling som indikerer at runden slutter og turen bliver skiftet.
function countdownTimer() {
    if (timeLeft === 0) {
        timeLeft = TIME_PER_TURNS;
        if(performMove() === true) {
            swapSide();
        }
        broadcastTimeLeft();
        return;
    }
    timeLeft -= 1;
    broadcastTimeLeft();
}

//Serveren sender brættet til klienten for at opdaterer det på deres skærm.
function sendBoard(client) {
    client.sendUTF(JSON.stringify({action: "newBoard", board: JSON.stringify(board.getBoard())}));
}
//Serveren viser den igangværende timer for runden.
function broadcastTimeLeft() {
    clients.forEach(function (client) {
        sendTimeLeft(client);
    })
}
//Serveren sender hvor langt tid der er tilbage.
function sendTimeLeft(client) {
    client.sendUTF(JSON.stringify({action: "timeLeft", time: timeLeft}));
}
//Serveren sender hvilket hold klienten er sat på.
function sendCurrentSide(client) {
    client.sendUTF(JSON.stringify({action: "currentSide", currentSide: currentSide}));
}
//Håndterer de meddelelser serveren får.
//Serveren oversætter meddelelserne til JSOn for nemmere at sende dem til klienten.
function handleIncomingMessage(connection, data) {
    if (!isValidMessage(data.utf8Data)) {
        if (DEBUG) console.log("INVALID: " + JSON.stringify(data.utf8Data));
        return;
    }
    var message = JSON.parse(data.utf8Data);
    if (DEBUG) {
        console.log("VALID: " + JSON.stringify(message));
        console.log(message.action);
    }

    if (message.action === "move") {
        voteMove(clients.indexOf(connection), message.oldLocation, message.newLocation)
    } else if (message.action === "newBoard") {
        sendBoard(connection);
    } else if (message.action === "timeLeft") {
        sendTimeLeft(connection);
    } else if (message.action === "currentSide") {
        sendCurrentSide(connection);
    }
}
//Serveren sender en fejl meddelelse til klienten.
function sendErrorMessage(client, message) {
    client.sendUTF(JSON.stringify({action: "error", message: message}))
}
//Funktionen der gør det muligt for klienterne at stemme.
function voteMove(id, oldLoc, newLoc) {
    if (clientAlignment[id] !== currentSide) sendErrorMessage(clients[id], "Not your turn yet");

    if(board.getColor(oldLoc+"-"+newLoc) === clientAlignment[id]) {
        if (board.isValidMove(oldLoc, newLoc)) {
            clientVotes[id] = oldLoc + "-" + newLoc;
            broadcastVotes();
        } else {
            sendErrorMessage(clients[id], "Invalid move");
        }
    } else {
        sendErrorMessage(clients[id], "You can only move " + clientAlignment[id] + " pieces");
    }
}

function isValidMessage(data) {
    try {
        JSON.parse(data);
    } catch (e) {
        return false;
    }
    return true;
}
//Sender trækket til klienterne så de kan se det blive udført på deres bræt.
function broadcastMove(oldLocation, newLocation) {
    clients.forEach(function (client) {
        client.sendUTF(JSON.stringify({action: "move", oldLocation: oldLocation, newLocation: newLocation}));
    });
}

console.log("Game server running at port 5000\n");