// REQUIRES
// Load in web and file system requires, and socket.io
var http = require("http");				// web server
var socketio = require("socket.io");	// socket.io
var router = require("./router.js");
var GameManager = require("./GameManager.js"); // loads in GameManager class
var mysql = require('mysql');
// Attempt to use Node"s global port, otherwise use 3000
var PORT = process.env.PORT || process.env.NODE_PORT || 3000;

// MySQL configuration
var dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'airhockey'
};

// Create a MySQL connection pool
var pool = mysql.createPool(dbConfig);

// The current room number to create - increments when a new match is created
var curRoomNum = 1;



// Start server
var app = http.createServer(router).listen(PORT);
console.log("HTTP server started, listening on port " + PORT);


// WEBSOCKETS
// Pass the http server into socketio and save the returned websocket server
var io = socketio(app);

// Object which stores all connected users
var users = {};

// Array which stores users currently waiting for a connection
// If it has >1 users in, a new game room is created
var userQueue = [];

// A list of all of our GameManagers - the games currently running
var currentGames = [];

/* createGame
	desc: creates a new game from the first two users in the queue
*/
function createGame() {
	// build the string for a new room name
	// two players join the new room and are passed to a GameManager
	var roomName = "room" + curRoomNum;
	
	// increment room number so no users can join this room again
	++curRoomNum;
	
	// add the two users to the next room in the cycle - they're alone, ready for their match!
	userQueue[0].roomName = roomName;
	userQueue[1].roomName = roomName;
	userQueue[0].join(roomName);
	userQueue[1].join(roomName);
	
	// create the new game instance
	var newGame = new GameManager(roomName, io, userQueue[0], userQueue[1]);
	currentGames.push(newGame);
	
	// clear those two users from the queue
	userQueue.splice(0, 2);
}

/* cleanGames
	desc: checks games to find finished ones and clear them out
*/
function cleanGames() {
	for (var i = 0; i < currentGames.length; ++i) {
		// grab current one
		var curr = currentGames[i];
		
		// delete the game from the list if its complete
		// just to save memory so old games don't linger in the list
		if (curr.gameComplete) {
			currentGames.splice(currentGames.indexOf(curr), 1);
		}
	}
}


// Handle the 'register' event from the client
io.on('connection', (socket) => {
    console.log('A user connected');

    // Listen for the 'register' event
    socket.on('register', (data) => {
        const { username, password } = data;

        // Perform registration logic (e.g., insert user into the database)
        const query = 'INSERT INTO users (username, password) VALUES (?, ?)';
        pool.query(query, [username, password], (error, results) => {
            if (error) {
                console.error('Error registering user:', error);
                socket.emit('registrationResult', { msg: 'Registration failed. Please try again.' });
            } else {
                console.log('User registered successfully');
                socket.emit('registrationResult', { msg: 'Registration successful!' });
            }
        });
    });

	
	socket.on('join', function(data) {
        // Retrieve username and password from the client
        var username = data.name;
        var password = data.password; // Assuming you add a password input in your client.html

        // Check if the provided username and password are valid
        authenticateUser(username, password, function(err, isValid) {
            if (err) {
                socket.emit('msg', { msg: 'Error while authenticating user.' });
                return;
            }

            if (!isValid) {
                socket.emit('msg', { msg: 'Invalid username or password. Please try again.' });
                return;
            }

            // Continue with the rest of your code if authentication is successful
            socket.username = username;
            users[username] = socket.name;
            userQueue.push(socket);

            socket.emit('msg', { msg: 'Searching for another user to play with...' });
            socket.emit('joinSuccess');

            if (userQueue.length >= 2) {
                createGame();
            }
        });
    });

    // listen for disconnect events
	socket.on("disconnect", function(data) {
        // Check if the socket has a username
        if (socket.username) {
            // delete the user from the users list
            delete users[socket.username];

            // delete the user from the queue
            var index = userQueue.indexOf(socket);
            if (index !== -1) {
                userQueue.splice(index, 1);
            }
        }
    });


    // Function to authenticate a user against the database
    function authenticateUser(username, password, callback) {
        pool.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], function(err, results) {
            if (err) {
                console.error('Error during authentication:', err);
                callback(err, false);
            } else {
                // Check if any rows were returned (authentication successful)
                callback(null, results.length > 0);
            }
        });
    }
});

//onJoined(socket);
//onDisconnect(socket);

// Pass any new connections to our handler delegates
//io.sockets.on("connection", function(socket) {
	
	
//});

console.log("Websocket server started");

// start a loop to clear empty games
setInterval(cleanGames, 1000);