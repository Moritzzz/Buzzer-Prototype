// Initialize packages
const express = require('express')
const socketio = require('socket.io')
const bodyParser = require('body-parser')
const app = express()
const Datastore = require('nedb')
const db = new Datastore()
const url = require('url')
const { body, validationResult, check } = require('express-validator');

// Initialize Express App
app.set('view engine', 'ejs')
app.use(express.static('public')) // Initialize path
app.use(express.json())
app.use(express.urlencoded({
    extended: true
}))

// URL routing
app.get('/', (req, res) => {
    res.render('index')
}) // Base URL

app.get('/create', (req, res) => {
    res.render('create', {errors: null})
}) // Create Room URL

// Form validation for /create
app.post('/create', 
    check('username', 'Must fill out a username').isLength({min: 1}).trim().escape(),
    (req, res) => {
        const errors = validationResult(req)

        if(!errors.isEmpty()) {
            res.render("create", {errors: errors.array()}) // return /create with the appropriate errors
        } else {
            // define the nature of the id to be generated
            const { customAlphabet } = require('nanoid');
            const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
            const nanoid = customAlphabet(alphabet, 6);

            let id = nanoid() // create a random ID

            // generate the room object
            let room = {
                id: id,
                users: [],
                admin: [],
                buzzer: {
                    locked: false,
                    currentBuzz: [],
                    buzzWinner: "",
                    buzzed: []
                }
            }

            // Insert the room object
            db.insert(room, function(err, newDoc) {
                
                // on nedb callback, redirect to the room as an admin with the appropriate query strings
                res.redirect(url.format({
                    pathname:"/room/admin",
                    query: {
                        "username": req.body.username,
                        "room": id
                    }
                }))
            })
        }
})

app.get('/join', (req, res) => {
    res.render('join', {errors: null, form: {username: null, room: null}})
}) // Join Room URL

// Form validation for /join | Follows same pattern as /create form validation
app.post('/join', 
    check('username', 'Must fill out a username').trim().isLength({min: 1}).escape(),
    check('room', 'Must fill out a valid room code').trim().isLength({min: 6, max: 6}).escape(),
    (req, res) => {
        let errors = validationResult(req).array()

        if(errors.length != 0) {
            res.render("join", {errors: errors, form: req.body})
        } else {
            db.findOne({id: req.body.room}, function(err, doc) {
                if(doc == null) { // if the given room does not exist
                    res.render("join", {errors: [{msg: "That room does not exist"}], form: req.body})
                } else {
                    if(doc.users.includes(req.body.username)) { // if the username given in the given room already exists
                        res.render("join", {errors: [{msg: "That username is already taken"}], form: req.body})
                    }
                    
                    res.redirect(url.format({
                        pathname:"/room/guest",
                        query: {
                            "username": req.body.username,
                            "room": req.body.room
                        }
                    }))
                }
            })
        }
})

app.get('/room', (req, res) => {
    res.render('room')
}) // Room URL

app.get('/room/admin', (req, res) => {
    res.render('room', {username: req.query.username, room: req.query.room, isAdmin: true})
}) // Room URL as admin

app.get('/room/guest', (req, res) => {
    res.render('room', {username: req.query.username, room: req.query.room, isAdmin: false})
}) // Room URL as guest

// Initialize server
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    console.log('Server Started')
})

// Initialize socket.io server instance
const io = socketio(server)

io.on('connection', socket => {
    console.log("User Connected")

    // on the event "create room" which is only sent by /room/admin
    socket.on("createRoom", data => {
        // Initialize socket variables
        socket.room = data.room
        socket.username = data.username
        socket.team = data.username
        socket.isAdmin = true
        socket.join(socket.room)

        // locate the previously created room in db, and then join as admin
        db.findOne({id: socket.room}, function(err, doc) {
            if(doc) {
                db.update({id: socket.room}, {$push: {users: socket.username}, $set: {admin: socket.username}}, {}, function() {
                    console.log("Room With ID: ", socket.room, "Created By: ", socket.username)
        
                    // tell the client that the event was successful
                    socket.emit("joinSuccess", {room: socket.room})
        
                    db.findOne({id: socket.room}, function(err, doc) {
                        if(doc) {
                            // give event to update the userlist for all clients in the room
                            io.in(socket.room).emit("updateUsers", {users: doc.users})
                        }
                    })
                })
            } else {
                // tell the client that the event was unsuccessful, which redirects back to the landing page
                socket.emit("joinFailure")
            }
        })
    })

    // on the event "join room" which is only sent by /room/guest
    socket.on("joinRoom", data => {
        // Initialize socket variables
        socket.room = data.room
        socket.username = data.username
        socket.team = data.username
        socket.isAdmin = false
        socket.join(socket.room)

        // locate the room and insert the user into the room
        db.findOne({id: socket.room}, function(err, doc) {
            if(doc) {
                db.update({id: socket.room}, {$push: {users: socket.username}}, {}, function() {
                    console.log("Room With ID: ", socket.room, "Joined By: ", socket.username)
        
                    // tell the client the event was successful
                    socket.emit("joinSuccess", {room: socket.room})
        
                    db.findOne({id: socket.room}, function(err, doc) {
                        if(doc) {
                            // update the userlist for all clients in the room
                            io.in(socket.room).emit("updateUsers", {users: doc.users})
                        }
                    })
                })
            } else {
                // tell the client the event was unsuccessful, which redirects them back to the landing page
                socket.emit("joinFailure")
            }
        })
    })

    // event triggered when a user disconnects
    socket.on("disconnect", data => {
        if(socket.room) {
            if(socket.isAdmin) {
                // if the socket is an admin, dissolve the room and redirect all clients in the room back to the landing page
                db.remove({id: socket.room}, function() {})
                console.log(socket.room, " Has Been Dissolved")
                io.in(socket.room).emit("dissolveRoom")
            } else {
                // if the socket is not an admin, remove them from the userlist, and update the userlist for all clients in the room
                db.findOne({id: socket.room}, function(err, doc) {
                    if(doc) {
                        db.update({id: socket.room}, {$pull: {users: socket.username}}, {}, function() {
                            db.findOne({id: socket.room}, function(err, doc) {
                                io.in(socket.room).emit("updateUsers", {users: doc.users})
                                console.log(socket.username, " Has Left Room: ", socket.room)
                            })
                        })
                    }
                })
            }
        }
    })

    // logic when a player buzzes in
    socket.on("buzz", data => {
        db.findOne({id: socket.room}, function(err, doc) {
            if(doc.buzzer.locked == false && !doc.buzzer.buzzed.some((a) => a[0] == socket.team) && !doc.buzzer.currentBuzz.some((a) => a[0] == socket.team)) { // check if the buzzer is locked, the user has already buzzed, or the users buzzer is locked
                db.update({id: socket.room}, {$push: {"buzzer.currentBuzz": [socket.team, data.time]}, $set: {"buzzer.buzzWinner": ""}}, {multi: true}, function() {})
                db.findOne({id: socket.room}, function(err, doc) {
                    // update the buzzer state for all clients in the room
                    io.in(socket.room).emit("updateBuzzer", {buzzer: doc.buzzer})
                })

                if(!doc.buzzer.currentBuzz.length) { // if this is the first buzz
                    setTimeout(function() { // this function will be called after 1 second, and determine the buzz winner
                        db.update({id: socket.room}, {$set: {"buzzer.locked": true}}, {}, function() {})
    
                        db.findOne({id: socket.room}, function(err, doc) {
                            let buzzes = doc.buzzer.currentBuzz
    
                            // a custom sorting function that sorts tuples by their second element (buzz timestamp in this case)
                            buzzes.sort(function(a, b) { 
                                return a[1] > b[1] ? 1 : -1;
                            });
    
                            db.update({id: socket.room}, {$push: {"buzzer.buzzed": buzzes[0]}, $set: {"buzzer.currentBuzz": [], "buzzer.buzzWinner": buzzes[0]}}, {multi: true}, function() {
                                db.findOne({id: doc.id}, function(err, doc) {
                                    // update the buzzer state again
                                    io.in(socket.room).emit("updateBuzzer", {buzzer: doc.buzzer})
                                })
                            })
                        })
    
                        
                    }, 1000)
                }
            }
        })
    })

    // called by the admin, and will set locked = false and reset the buzz winner
    socket.on("unlockBuzzer", function() {
        db.update({id: socket.room}, {$set: {"buzzer.locked": false, "buzzer.buzzWinner": ""}}, {multi: true}, function() {
            db.findOne({id: socket.room}, function(err, doc) {
                io.in(socket.room).emit("updateBuzzer", {buzzer: doc.buzzer})
            })
        })
    })

    // called by the admin, will set locked = false, and reset the buzz winner and buzzed list
    socket.on("resetBuzzer", function() {
        db.update({id: socket.room}, {$set: {"buzzer.locked": false, "buzzer.currentBuzz": [], "buzzer.buzzWinner": "", "buzzer.buzzed": []}}, {multi: true}, function() {
            db.findOne({id: socket.room}, function(err, doc) {
                io.in(socket.room).emit("updateBuzzer", {buzzer: doc.buzzer})
            })
        })
    })
})
